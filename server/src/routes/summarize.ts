// ============================================================
// AI Суммаризация через DeepSeek API (SQLite)
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticles, readMetrics, saveReport, writeMetrics, getMetricsTrend, readReports, Metric } from '../db.js';

const router = Router();
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

// ==================== Промпты ====================

const SUMMARIZE_SOURCES_PROMPT = `Ты — профессиональный аналитик строительной отрасли России.
Сделай аналитическую сводку по новостям из указанного источника за заданный период.
Формат: 1) **Общая картина** 2) **Ключевые события** (до 5) 3) **Выводы**`;

const EXTRACT_METRICS_PROMPT = `Ты — анализатор строительного рынка. Извлеки из новости КОНКРЕТНЫЕ метрики.
Верни ТОЛЬКО валидный JSON-массив. Каждый объект:
{
  "metric_name": "короткое имя метрики",
  "metric_value": "число или фраза",
  "direction": "up|down|flat|unknown",
  "segment": "ипотека|цены|спрос|ввод_жилья|себестоимость|регуляторика|инвестиции|другое",
  "region": "РФ|Москва|СПб|...",
  "confidence": 0.0-1.0
}
Если метрик нет — верни []. НЕ добавляй markdown, только JSON.`;

const FORECAST_PROMPT = `Ты — ведущий аналитик строительного рынка. Дай прогноз на основе ИСТОРИЧЕСКИХ ДАННЫХ и свежих новостей.
У тебя есть:
1. История метрик за предыдущие периоды (тренды)
2. Свежие новости за последнюю неделю
3. Предыдущий прогноз (если был)

Формат ответа:
## Прогноз на неделю

### Что продолжит расти ▲
(конкретные сегменты, с цифрами из истории)

### Что пойдёт вниз ▼

### Ключевые риски
(что может сломать прогноз)

### Рекомендации
(для специалиста стройотрасли — на что обратить внимание)

Опирайся ТОЛЬКО на предоставленные данные. Указывай конкретные числа из истории.`;

// ==================== Helpers ====================

async function callDeepSeek(apiKey: string, systemPrompt: string, userPrompt: string, maxTokens: number = 2000): Promise<string> {
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
  const { apiKey, sourceIds, daysBack, maxLength } = req.body as any;
  if (!apiKey) { res.status(400).json({ error: 'apiKey обязателен' }); return; }

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
      const summary = await callDeepSeek(apiKey, SUMMARIZE_SOURCES_PROMPT, prompt);
      summaries.push({ sourceId, sourceName: group.name, articleCount: group.articles.length, dateRange: { from: '', to: '' }, summary });
    } catch (err: any) {
      summaries.push({ sourceId, sourceName: group.name, articleCount: group.articles.length, dateRange: { from: '', to: '' }, summary: '', error: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  res.json({ summaries });
});

// POST /api/metrics/extract — извлечение метрик из статей через AI
router.post('/metrics/extract', async (req: Request, res: Response) => {
  const { apiKey, sourceIds, daysBack } = req.body as any;
  if (!apiKey) { res.status(400).json({ error: 'apiKey обязателен' }); return; }

  const days = daysBack || 7;
  const { articles } = readArticles(undefined, days, 200, 0);
  const filtered = sourceIds?.length ? articles.filter((a: any) => sourceIds.includes(a.source)) : articles;

  const metrics: Metric[] = [];
  const errors: string[] = [];

  for (const article of filtered) {
    try {
      const prompt = `Заголовок: ${article.title}\n\nТекст: ${article.bodyText.slice(0, 2000)}`;
      const raw = await callDeepSeek(apiKey, EXTRACT_METRICS_PROMPT, prompt, 500);
      // Парсим JSON из ответа
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const m of parsed) {
          metrics.push({
            articleId: article.id,
            metricName: m.metric_name,
            metricValue: String(m.metric_value || ''),
            direction: m.direction || 'unknown',
            segment: m.segment || 'другое',
            region: m.region || 'РФ',
            confidence: m.confidence || 0.5,
            rawContext: raw.slice(0, 500),
            extractedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      errors.push(`${article.id}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  if (metrics.length > 0) {
    writeMetrics(metrics);
  }

  res.json({ extracted: metrics.length, errors });
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

// POST /api/forecast — AI-прогноз с историческим контекстом
router.post('/forecast', async (req: Request, res: Response) => {
  const { apiKey, daysBack } = req.body as any;
  if (!apiKey) { res.status(400).json({ error: 'apiKey обязателен' }); return; }

  const days = daysBack || 7;
  const allMetrics = readMetrics(30); // история за 30 дней
  const { articles } = readArticles(undefined, days, 200, 0);

  // Группируем метрики по имени для истории
  const metricHistory: Record<string, { values: string[]; directions: string[] }> = {};
  for (const m of allMetrics) {
    if (!metricHistory[m.metricName]) metricHistory[m.metricName] = { values: [], directions: [] };
    metricHistory[m.metricName].values.push(m.metricValue);
    metricHistory[m.metricName].directions.push(m.direction);
  }

  // Формируем исторический контекст
  const historyText = Object.entries(metricHistory).map(([name, data]) =>
    `**${name}**: значения [${data.values.slice(-10).join(', ')}], тренд: ${data.directions.slice(-5).join(' → ')}`
  ).join('\n');

  // Свежие новости
  const newsText = articles.map((a: any, i: number) => `${i + 1}. [${a.sourceName}] ${a.title}`).join('\n');

  const prompt = `ИСТОРИЯ МЕТРИК за 30 дней:\n${historyText || 'Нет данных'}\n\nСВЕЖИЕ НОВОСТИ за ${days} дн. (${articles.length} шт.):\n${newsText.slice(0, 5000)}\n\nДай прогноз на следующую неделю.`;

  try {
    const forecast = await callDeepSeek(apiKey, FORECAST_PROMPT, prompt, 2500);
    saveReport({
      type: 'forecast',
      title: `Прогноз на ${new Date().toLocaleDateString('ru-RU')}`,
      content: forecast,
      periodStart: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
      periodEnd: new Date().toISOString().slice(0, 10),
    });
    res.json({ forecast });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports — история прогнозов и сводок
router.get('/reports', (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const reports = readReports(type, 20);
  res.json({ reports });
});

export default router;
