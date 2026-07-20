// ============================================================
// AI Суммаризация через DeepSeek API (SQLite)
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticles, readMetrics, saveReport, writeMetrics, getMetricsTrend, readReports, readArticleById, Metric } from '../db.js';
import { readBenchmarks, refreshBenchmarks } from '../benchmarks.js';

const router = Router();
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

// ==================== Progress tracking ====================

interface JobProgress {
  id: string;
  type: 'metrics' | 'forecast';
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  currentItem: string;
  startedAt: string;
  error?: string;
  result?: string;
}

const jobs = new Map<string, JobProgress>();

function createJob(type: 'metrics' | 'forecast', total: number): string {
  const id = `${type}_${Date.now()}`;
  jobs.set(id, { id, type, status: 'running', total, done: 0, currentItem: '', startedAt: new Date().toISOString() });
  return id;
}

function updateJob(id: string, update: Partial<JobProgress>) {
  const job = jobs.get(id);
  if (job) Object.assign(job, update);
  // Очистка старых джобов (>5 мин)
  for (const [k, v] of jobs) {
    if (Date.now() - new Date(v.startedAt).getTime() > 300000) jobs.delete(k);
  }
}

// ==================== Промпты ====================

const SUMMARIZE_SOURCES_PROMPT = `Ты — профессиональный аналитик строительной отрасли России.
Сделай аналитическую сводку по новостям из указанного источника за заданный период.
Формат: 1) **Общая картина** 2) **Ключевые события** (до 5) 3) **Выводы**`;

export const EXTRACT_METRICS_PROMPT = `Ты — анализатор строительного рынка. Извлеки из новости ТОЛЬКО КОНКРЕТНЫЕ ЧИСЛОВЫЕ метрики.

ПРАВИЛА:
1. Извлекай метрику ТОЛЬКО если в тексте ЯВНО указано число. НЕ домысливай, НЕ округляй, НЕ выводи число из контекста если его нет в явном виде.
2. metric_value — СТРОГО число (не фраза, не "10-15", не "около 20"). Без знаков %, ₽, пробелов, запятых-разделителей. Пример: 16.5, а не "16.5%" или "16,5%". Если значение "2,1 млн" — запиши как 2100000.
3. Если число указано с единицей измерения — положи её в unit, а в metric_value — только число.
4. Если в статье нет измеримых числовых метрик — верни [] (пустой массив). Это НОРМАЛЬНО. Лучше пустой массив чем ложная метрика.
5. НЕ извлекай: мнения экспертов без цифр, планы/прогнозы на будущее, проценты без базового значения, качественные оценки.
6. confidence КАЛИБРУЙ ЧЕСТНО: явное число из официаольного отчёта = 0.9, явное число из новости = 0.8, число косвенно вычислено из контекста = 0.5, предположительное/округлённое = 0.3. Если число не названо явно — не извлекай.
7. metric_name СТАНДАРТИЗИРУЙ: используй канонические имена. Правильно: 'Ипотечная ставка', 'Цена м²', 'Объём ввода жилья', 'Ключевая ставка ЦБ', 'Курс USD', 'Себестоимость строительства м²', 'Объём ипотечного кредитования'. Избегай уникальных формулировок из конкретной статьи.
8. direction: "up" если в статье указан рост показателя, "down" — падение, "flat" — без изменений. Опирайся ТОЛЬКО на текст статьи — не сравнивай со своими знаниями.
9. segment — ВЫБИРАЙ ТОЧНО: не всё подряд в "другое".

Верни ТОЛЬКО валидный JSON-массив. Каждый объект:
{
  "metric_name": "короткое каноническое имя",
  "metric_value": число,
  "unit": "%|₽|₽/м²|м²|млн м²|тыс. шт.|млрд ₽|п.п.|ед.|USD|чел.|индекс",
  "direction": "up|down|flat",
  "segment": "ипотека|цены|спрос|ввод_жилья|себестоимость|регуляторика|инвестиции|проектное_финансирование|ИЖС|коммерческая_недвижимость|реновация|другое",
  "region": "РФ|Москва|СПб|Московская область|Краснодарский край|другой",
  "confidence": 0.0-1.0
}

ПРИМЕРЫ ЧЕГО НЕ ИЗВЛЕКАТЬ:
- "Цены на жильё выросли" (нет числа) → []
- "Ожидается рост на 10%" (прогноз, не свершившийся факт) → []
- "Планируется ввести 5 млн м² жилья" (план на будущее) → []
- "Ставка может снизиться" (нет числа, предположение) → []
- "Рынок показал положительную динамику" (нет конкретной цифры) → []

ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА:
[{"metric_name":"Ипотечная ставка","metric_value":16.5,"unit":"%","direction":"up","segment":"ипотека","region":"РФ","confidence":0.8}]

НЕ добавляй markdown, НЕ добавляй комментарии, НЕ оборачивай в \`\`\`json. Только JSON-массив.`;

const FORECAST_PROMPT = `Ты — ведущий аналитик строительного рынка. Дай прогноз на ОДНУ неделю на основе ИСТОРИЧЕСКИХ ДАННЫХ и свежих новостей.

ПРАВИЛА:
1. Опирайся ТОЛЬКО на предоставленные данные. Все числа — ТОЛЬКО из истории метрик. НЕ выдумывай цифры.
2. Для каждого прогноза указывай СТЕПЕНЬ УВЕРЕННОСТИ: «высокая» (устойчивый тренд 4+ недели), «средняя» (тренд 2-3 недели), «низкая» (единичное измерение или разнонаправленные данные).
3. Если данных слишком мало для обоснованного прогноза — честно напиши об этом в разделе «Ключевые риски», не пытайся угадать.
4. НЕ предсказывай экстремальные события (обвал рынка, кризис, дефолт) если на них нет ЯВНЫХ сигналов в новостях.
5. Учитывай ВЗАИМОСВЯЗИ между метриками: рост ключевой ставки → удорожание ипотеки → падение спроса → снижение цен. Описывай цепочки, а не изолированные прогнозы.
6. Если тренд противоречивый (часть метрик растёт, часть падает) — укажи это, не упрощай картину.

Формат ответа:
## Прогноз на неделю

### Что продолжит расти ▲
(конкретные метрики с цифрами из истории, степень уверенности)

### Что пойдёт вниз ▼
(аналогично)

### Что останется стабильным
(метрики без выраженного тренда — это тоже важная информация)

### Ключевые риски
(что может сломать прогноз: внешние факторы из новостей, недостаток данных, противоречивые сигналы)

### Рекомендации
(для специалиста стройотрасли: на что обратить внимание, какие сегменты мониторить особенно пристально. БЕЗ финансовых рекомендаций по покупке/продаже)`;

// ==================== Helpers ====================

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY не задан в .env на сервере');
  return key;
}

async function callDeepSeek(systemPrompt: string, userPrompt: string, maxTokens: number = 2000): Promise<string> {
  const apiKey = getApiKey();
  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`DeepSeek API ${res.status}: ${err.slice(0, 200)}`); }
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

// ==================== Endpoints ====================

// POST /api/summarize/sources — сводка по источникам за период
router.post('/summarize/sources', async (req: Request, res: Response) => {
  try {
    getApiKey(); // проверим что ключ есть
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const { sourceIds, daysBack, maxLength } = req.body as any;

  const days = daysBack || 7;
  const { articles } = readArticles(undefined, days, 1000, 0);

  if (articles.length === 0) {
    res.json({ summaries: [], message: 'Нет статей за выбранный период' });
    return;
  }

  const filtered = sourceIds?.length ? articles.filter((a: any) => sourceIds.includes(a.source)) : articles;
  const bySource: Record<string, { name: string; articles: typeof articles }> = {};
  for (const a of filtered) {
    if (!bySource[a.source]) bySource[a.source] = { name: a.sourceName, articles: [] };
    bySource[a.source].articles.push(a);
  }

  const summaries: any[] = [];
  for (const [sourceId, group] of Object.entries(bySource)) {
    try {
      group.articles.sort((a: any, b: any) => b.publishedAt.localeCompare(a.publishedAt));
      const text = group.articles.map((a: any, i: number) => `${i + 1}. ${a.title}\n${a.bodyText.slice(0, 600).trim()}`).join('\n\n');
      const prompt = `Сводка по "${group.name}" за ${days} дн. (${group.articles.length} новостей). Объём: до ${maxLength || 400} слов.\n\n${text.slice(0, 10000)}`;
      const summary = await callDeepSeek(SUMMARIZE_SOURCES_PROMPT, prompt);
      summaries.push({ sourceId, sourceName: group.name, articleCount: group.articles.length, dateRange: { from: '', to: '' }, summary });
    } catch (err: any) {
      summaries.push({ sourceId, sourceName: group.name, articleCount: group.articles.length, dateRange: { from: '', to: '' }, summary: '', error: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  res.json({ summaries });
});

// POST /api/metrics/extract — старт извлечения метрик (асинхронно, прогресс через /status)
router.post('/metrics/extract', async (req: Request, res: Response) => {
  try {
    getApiKey();
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const { sourceIds, daysBack } = req.body as any;

  const days = daysBack || 7;
  const { articles } = readArticles(undefined, days, 500, 0);
  const filtered = sourceIds?.length ? articles.filter((a: any) => sourceIds.includes(a.source)) : articles;

  if (filtered.length === 0) {
    res.json({ jobId: '', message: 'Нет статей за выбранный период' });
    return;
  }

  const jobId = createJob('metrics', filtered.length);
  res.json({ jobId, total: filtered.length, message: `Извлечение метрик запущено (${filtered.length} статей)` });

  // Запускаем асинхронно
  (async () => {
    const metrics: Metric[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const article = filtered[i];
      updateJob(jobId, { done: i, currentItem: article.title.slice(0, 80) });
      try {
        const prompt = `Заголовок: ${article.title}\n\nТекст: ${article.bodyText.slice(0, 2000)}`;
        const raw = await callDeepSeek(EXTRACT_METRICS_PROMPT, prompt, 400);
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const m of parsed) {
            metrics.push({
              articleId: article.id, metricName: m.metric_name, metricValue: String(m.metric_value || ''),
              unit: m.unit || '', direction: m.direction || 'unknown', segment: m.segment || 'другое',
              region: m.region || 'РФ', confidence: m.confidence || 0.5,
              rawContext: raw.slice(0, 500), extractedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err: any) {
        // Продолжаем несмотря на ошибки
      }
      await new Promise(r => setTimeout(r, 250));
    }
    if (metrics.length > 0) writeMetrics(metrics);
    updateJob(jobId, { status: 'done', done: filtered.length, currentItem: `Готово: ${metrics.length} метрик` });
  })().catch(err => {
    updateJob(jobId, { status: 'error', error: err.message });
  });
});

// GET /api/metrics/extract/status — прогресс извлечения
router.get('/metrics/extract/status', (req: Request, res: Response) => {
  const { jobId } = req.query;
  const job = jobId ? jobs.get(String(jobId)) : null;
  if (!job) {
    // Вернуть последнюю активную джобу
    const running = Array.from(jobs.values()).find(j => j.status === 'running');
    res.json({ job: running || null });
    return;
  }
  res.json({ job });
});

// GET /api/metrics — получить извлечённые метрики
router.get('/metrics', (req: Request, res: Response) => {
  const daysBack = parseInt(req.query.days as string, 10) || 30;
  const metrics = readMetrics(daysBack);
  res.json({ metrics });
});

// GET /api/metrics/trend/:name — тренд по метрике
router.get('/metrics/trend/:name', (req: Request, res: Response) => {
  const daysBack = parseInt(req.query.days as string, 10) || 30;
  const trend = getMetricsTrend(String(req.params.name), daysBack);
  res.json({ metric: req.params.name, trend });
});

// POST /api/forecast — AI-прогноз с историческим контекстом (асинхронно)
router.post('/forecast', async (req: Request, res: Response) => {
  try {
    getApiKey();
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const { daysBack } = req.body as any;

  const jobId = createJob('forecast', 3);
  res.json({ jobId, message: 'Генерация прогноза запущена' });

  (async () => {
    try {
      const days = daysBack || 7;
      updateJob(jobId, { done: 1, currentItem: 'Сбор исторических метрик...' });
      const allMetrics = readMetrics(Math.max(30, days)); // не менее 30 дней, но если выбран год — год
      const { articles } = readArticles(undefined, days, 200, 0);

      updateJob(jobId, { done: 2, currentItem: 'Формирование контекста...' });
      const metricHistory: Record<string, { values: string[]; directions: string[] }> = {};
      for (const m of allMetrics) {
        if (!metricHistory[m.metricName]) metricHistory[m.metricName] = { values: [], directions: [] };
        metricHistory[m.metricName].values.push(m.metricValue);
        metricHistory[m.metricName].directions.push(m.direction);
      }

      const historyText = Object.entries(metricHistory).map(([name, data]) =>
        `**${name}**: значения [${data.values.slice(-10).join(', ')}], тренд: ${data.directions.slice(-5).join(' → ')}`
      ).join('\n');

      const newsText = articles.map((a: any, i: number) => `${i + 1}. [${a.sourceName}] ${a.title}`).join('\n');
      const prompt = `ИСТОРИЯ МЕТРИК за 30 дней:\n${historyText || 'Нет данных'}\n\nСВЕЖИЕ НОВОСТИ за ${days} дн. (${articles.length} шт.):\n${newsText.slice(0, 5000)}\n\nДай прогноз на следующую неделю.`;

      updateJob(jobId, { done: 2, currentItem: 'Генерация прогноза AI...' });
      const forecast = await callDeepSeek(FORECAST_PROMPT, prompt, 2500);

      saveReport({
        type: 'forecast', title: `Прогноз на ${new Date().toLocaleDateString('ru-RU')}`,
        content: forecast,
        periodStart: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
        periodEnd: new Date().toISOString().slice(0, 10),
      });

      updateJob(jobId, { status: 'done', done: 3, currentItem: 'Прогноз готов', result: forecast });
    } catch (err: any) {
      updateJob(jobId, { status: 'error', error: err.message });
    }
  })().catch(err => updateJob(jobId, { status: 'error', error: err.message }));
});

// GET /api/reports — история прогнозов и сводок
router.get('/reports', (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const reports = readReports(type, 20);
  res.json({ reports });
});

// ==================== New: Sparklines, Interpretation, What-if, Alerts ====================

// GET /api/metrics/:name/sparkline — aggregated weekly values для sparkline-графиков
router.get('/metrics/:name/sparkline', (req: Request, res: Response) => {
  const weeks = parseInt(req.query.weeks as string, 10) || 8;
  const trend = getMetricsTrend(String(req.params.name), weeks * 7);
  // Aggregate by week
  const byWeek: Record<string, number[]> = {};
  for (const t of trend) {
    const d = new Date(t.date);
    const weekStart = new Date(d.setDate(d.getDate() - d.getDay())).toISOString().slice(0, 10);
    if (!byWeek[weekStart]) byWeek[weekStart] = [];
    const v = parseFloat(t.value);
    if (!isNaN(v)) byWeek[weekStart].push(v);
  }
  const sparkline = Object.entries(byWeek).sort().map(([w, vals]) => ({
    week: w,
    value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100,
    count: vals.length,
  }));
  // Last direction
  const last = trend[trend.length - 1];
  res.json({ metric: req.params.name, sparkline, direction: last?.direction || 'flat' });
});

// POST /api/metrics/interpret — AI объясняет причину изменения метрики
router.post('/metrics/interpret', async (req: Request, res: Response) => {
  try {
    getApiKey();
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const { metricName, metricValue, direction, articleId } = req.body as any;
  if (!metricName) { res.status(400).json({ error: 'metricName обязателен' }); return; }

  // Ищем связанные статьи: сначала по article_id из метрики, потом по ключевым словам
  let relatedNews: any[] = [];
  if (articleId) {
    const article = readArticleById(articleId);
    if (article) relatedNews = [article];
  }
  if (relatedNews.length === 0) {
    // Fallback: поиск по полному названию метрики (первые 2 слова)
    const keywords = metricName.toLowerCase().split(' ').slice(0, 2).join(' ');
    const { articles } = readArticles(undefined, 7, 20, 0);
    relatedNews = articles.filter((a: any) =>
      a.bodyText.toLowerCase().includes(keywords) || a.title.toLowerCase().includes(keywords)
    ).slice(0, 5);
  }

  const prompt = `Метрика "${metricName}" сейчас: ${metricValue} (${direction === 'up' ? 'растёт' : direction === 'down' ? 'падает' : 'стабильна'}).
Связанные новости:\n${relatedNews.map((a: any, i: number) => `${i + 1}. [${a.sourceName}] ${a.title}`).join('\n') || 'Нет новостей'}
Объясни (2-3 предложения): ПОЧЕМУ произошло изменение. Ссылайся на конкретные новости из списка выше. Если связь между метрикой и новостями неочевидна — начни с фразы "Точная причина неясна, но возможно...". Объясни, ЧТО ЭТО ЗНАЧИТ для строительного бизнеса.`;

  try {
    const interpretation = await callDeepSeek('Ты — ведущий аналитик строительного рынка. Объясняй причинно-следственные связи на основе новостей. Если причина неочевидна — честно признай это, не выдумывай.', prompt, 350);
    res.json({ metricName, interpretation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forecast/whatif — сценарный анализ с изменёнными параметрами
router.post('/forecast/whatif', async (req: Request, res: Response) => {
  try {
    getApiKey();
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const { adjustments } = req.body as any;

  const allMetrics = readMetrics(90); // what-if: 90 дней истории для контекста
  const { articles } = readArticles(undefined, 7, 200, 0);

  const historyText = Object.entries(
    allMetrics.reduce((acc: any, m) => {
      if (!acc[m.metricName]) acc[m.metricName] = [];
      acc[m.metricName].push(m.metricValue);
      return acc;
    }, {})
  ).map(([name, values]: any) => `**${name}**: было [${values.slice(-5).join(', ')}]`)
    .join('\n');

  const adjText = adjustments
    ? Object.entries(adjustments).map(([k, v]: any) => `- ${k}: изменено на ${v > 0 ? '+' + v + '%' : v + '%'}`).join('\n')
    : '';

  const prompt = `ИСТОРИЯ МЕТРИК:\n${historyText}\n\nСЦЕНАРИЙ (что если):\n${adjText}\n\nСпрогнозируй, как эти изменения повлияют на рынок в целом. Учитывай ВЗАИМОСВЯЗИ между метриками — опиши цепную реакцию. Сравни с текущим состоянием (без изменений).\n\nФормат:\n### Прямые эффекты\n(что изменится непосредственно)\n\n### Цепная реакция\n(как изменение одних метрик повлияет на другие — опиши логическую цепочку)\n\n### Риски сценария\n\n### Вывод\n(общая оценка влияния на строительный рынок, без финансовых рекомендаций)`;

  try {
    const forecast = await callDeepSeek('Ты — аналитик строительного рынка. Моделируй взаимосвязи: рост ставок → удорожание кредитов → снижение спроса → коррекция цен. Учитывай цепные реакции. НЕ выдумывай цифры, не подкреплённые историей. Без финансовых рекомендаций.', prompt, 2000);
    res.json({ scenario: adjText, forecast });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts — срочные сигналы: новости, повлиявшие на метрики
router.get('/alerts', (_req: Request, res: Response) => {
  const { articles } = readArticles(undefined, 3, 50, 0);
  const metrics = readMetrics(3);

  // Находим метрики с резкими изменениями (вверх/вниз)
  const alertMetrics = metrics.filter(m => m.direction !== 'flat' && m.confidence > 0.6).slice(0, 8);

  // Связываем с новостями
  const alerts = alertMetrics.map(m => {
    const related = articles.find((a: any) =>
      a.title.toLowerCase().includes(m.metricName.toLowerCase().slice(0, 5)) ||
      a.bodyText.toLowerCase().includes(m.metricName.toLowerCase().slice(0, 5))
    );
    const severity = m.confidence > 0.8 ? 'critical' : m.confidence > 0.6 ? 'warning' : 'info';
    return {
      metric: m.metricName,
      value: m.metricValue,
      unit: (m as any).unit || '',
      direction: m.direction,
      segment: m.segment,
      region: m.region,
      confidence: m.confidence,
      severity,
      relatedNews: related ? { title: related.title, source: related.sourceName, url: related.url } : null,
    };
  });

  res.json({ alerts, generatedAt: new Date().toISOString() });
});

// GET /api/benchmarks — официальные бенчмарки
router.get('/benchmarks', (req: Request, res: Response) => {
  const indicator = req.query.indicator as string | undefined;
  const daysBack = parseInt(req.query.days as string, 10) || 90;
  const benchmarks = readBenchmarks(indicator, daysBack);
  res.json({ benchmarks });
});

// POST /api/benchmarks/refresh — принудительное обновление
router.post('/benchmarks/refresh', async (_req: Request, res: Response) => {
  try {
    const results = await refreshBenchmarks();
    res.json({ ok: true, updated: results.length, benchmarks: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
