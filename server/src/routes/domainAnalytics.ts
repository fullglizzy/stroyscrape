// ============================================================
// Доменная аналитика: Энергетика и Цифровизация строительства
// AI-отчёты с памятью предыдущих генераций
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticlesByDomain, getClassificationStats, saveAnalyticsReport, getLatestAnalyticsReport, getAnalyticsReportHistory } from '../db.js';
import { validateInt } from '../validation.js';
import { logger } from '../logger.js';
import type { ArticleDomain } from '../types.js';

import fs from 'node:fs';
import path from 'node:path';

const router = Router();
const DEEPSEEK_API = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com') + '/chat/completions';

/** Модель для генерации отчётов (можно deepseek-reasoner для более глубокого анализа) */
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || 'deepseek-chat';

// ==================== Job system (same pattern as summarize.ts) ====================

const DATA_DIR = process.env.DATA_DIR || './data';
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

interface JobProgress {
  id: string;
  type: 'domain_analytics';
  domain: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  currentItem: string;
  startedAt: string;
  error?: string;
  result?: string;
}

function loadJobs(): Map<string, JobProgress> {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
      const map = new Map<string, JobProgress>();
      for (const [k, v] of Object.entries(data)) {
        map.set(k, v as JobProgress);
      }
      for (const [, job] of map) {
        if (job.status === 'running') {
          job.status = 'error';
          job.error = 'Сервер был перезапущен во время выполнения';
        }
      }
      return map;
    }
  } catch { /* ignore corrupt file */ }
  return new Map();
}

function saveJobs(jobs: Map<string, JobProgress>) {
  try {
    const dir = path.dirname(JOBS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: Record<string, JobProgress> = {};
    for (const [k, v] of jobs) obj[k] = v;
    fs.writeFileSync(JOBS_FILE, JSON.stringify(obj), 'utf-8');
  } catch { /* ignore */ }
}

const jobs = loadJobs();

function createJob(domain: string, total: number): string {
  const id = `domain_${domain}_${Date.now()}`;
  jobs.set(id, { id, type: 'domain_analytics', domain, status: 'running', total, done: 0, currentItem: '', startedAt: new Date().toISOString() });
  saveJobs(jobs);
  return id;
}

function updateJob(id: string, update: Partial<JobProgress>) {
  const job = jobs.get(id);
  if (job) Object.assign(job, update);
  let changed = false;
  for (const [k, v] of jobs) {
    if (Date.now() - new Date(v.startedAt).getTime() > 1_800_000) { jobs.delete(k); changed = true; }
  }
  if (update.status === 'done' || update.status === 'error') changed = true;
  if (changed) saveJobs(jobs);
}

// ==================== Вспомогательные функции ====================

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY не задан в .env на сервере');
  return key;
}

async function callDeepSeek(systemPrompt: string, userPrompt: string, maxTokens: number = 3000): Promise<string> {
  const apiKey = getApiKey();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) { const err = await res.text(); throw new Error(`DeepSeek API ${res.status}: ${err.slice(0, 200)}`); }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content || '';
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('DeepSeek API: превышен таймаут (90с)');
    throw err;
  }
}

// ==================== Системные промпты ====================

export const ENERGY_SYSTEM_PROMPT = `Ты — ведущий аналитик строительного рынка России, специализирующийся на энергетической инфраструктуре в строительстве.

Твоя задача — проанализировать подборку новостей по энергетике и составить структурированную аналитическую сводку для строительного эксперта.

ПРАВИЛА:
1. Опирайся ТОЛЬКО на предоставленные новости. НЕ выдумывай факты и цифры.
2. Для КАЖДОГО утверждения указывай номер новости в квадратных скобках: [1], [2] и т.д. Это ОБЯЗАТЕЛЬНО. Используй только одиночные ссылки, НЕ группируй их ([1,2,3] — неправильно, [1][2][3] — правильно).
3. Конкретные цифры (бюджеты, мощности, сроки) выделяй жирным.
4. Если по какому-то разделу нет информации — честно напиши «Нет данных в новостях за период».
5. Пиши на русском, деловым стилем, без воды.
6. Не давай инвестиционных или финансовых рекомендаций.
7. НЕ добавляй раздел «Источники» в конце — он будет добавлен автоматически.

Формат ответа — СТРОГО по разделам (каждый начинается с ## ):

## Ключевые события
2-3 самых важных события периода с датами и ссылками на новости [N].

## Новые программы и инициативы
Государственные и частные программы в энергетике, влияющие на строительный сектор: новые законы, постановления, стратегии, пилотные проекты. Ссылайся на новости [N].

## Финансирование
Куда пошли деньги: бюджеты, инвестиции, субсидии, кредитные линии — с конкретными суммами из новостей [N].

## Планы на ближайшие годы
Анонсированные проекты, дорожные карты, планы ввода мощностей, заявленные сроки [N].

## Замороженные и остановленные проекты
Что отменили, заморозили, перенесли сроки, сократили финансирование [N].

## Что изменилось с прошлого отчёта
Сравнение с предыдущим отчётом (если он предоставлен) — только то, что действительно изменилось.

## Выводы для строительного бизнеса
Практические выводы: к чему готовиться застройщикам, девелоперам, подрядчикам в свете описанных событий.`;

export const DIGITAL_SYSTEM_PROMPT = `Ты — ведущий аналитик строительного рынка России, специализирующийся на цифровизации и внедрении технологий в строительную отрасль.

Твоя задача — проанализировать подборку новостей по цифровизации строительства и составить структурированную аналитическую сводку для строительного эксперта.

ПРАВИЛА:
1. Опирайся ТОЛЬКО на предоставленные новости. НЕ выдумывай факты и цифры.
2. Для КАЖДОГО утверждения указывай номер новости в квадратных скобках: [1], [2] и т.д. Это ОБЯЗАТЕЛЬНО. Используй только одиночные ссылки, НЕ группируй их ([1,2,3] — неправильно, [1][2][3] — правильно).
3. Конкретные цифры (бюджеты, сроки внедрения) выделяй жирным.
4. Если по какому-то разделу нет информации — честно напиши «Нет данных в новостях за период».
5. Пиши на русском, деловым стилем, без воды.
6. Не давай инвестиционных или финансовых рекомендаций.
7. НЕ добавляй раздел «Источники» в конце — он будет добавлен автоматически.

Формат ответа — СТРОГО по разделам (каждый начинается с ## ):

## Ключевые события
2-3 самых важных события в цифровизации стройки за период [N].

## Новые технологии и платформы
Какие технологии внедряются: ТИМ/BIM, цифровые двойники, ИИ в проектировании и контроле, роботизация, дроны, 3D-печать [N].

## Регуляторика и стандарты
Новые законы, постановления, ГОСТы, требования по цифровизации: обязательность ТИМ, цифровой надзор, электронные разрешения [N].

## Импортозамещение и российское ПО
Какие российские решения внедряются взамен иностранных, успехи и проблемы перехода [N].

## Что меняется на стройплощадке
Реальные кейсы: где уже работает цифровой контроль, дроны, лазерное сканирование, умные каски — конкретные проекты [N].

## Что изменилось с прошлого отчёта
Сравнение с предыдущим отчётом (если он предоставлен) — только то, что действительно изменилось.

## Выводы для строительного бизнеса
Практические выводы: какие технологии внедрять в первую очередь, какие требования станут обязательными, к чему готовиться.`;

export const DATACENTER_SYSTEM_PROMPT = `Ты — ведущий аналитик рынка ЦОД и IT-инфраструктуры России.

Твоя задача — проанализировать подборку новостей по рынку ЦОД и составить структурированную аналитическую сводку для строительного эксперта.

ПРАВИЛА:
1. Опирайся ТОЛЬКО на предоставленные новости. НЕ выдумывай факты и цифры.
2. Для КАЖДОГО утверждения указывай номер новости в квадратных скобках: [1], [2] и т.д. Это ОБЯЗАТЕЛЬНО. Используй только одиночные ссылки, НЕ группируй их ([1,2,3] — неправильно, [1][2][3] — правильно).
3. Конкретные цифры (мощности в МВт, стойки, инвестиции) выделяй жирным.
4. Если по какому-то разделу нет информации — честно напиши «Нет данных в новостях за период».
5. Пиши на русском, деловым стилем, без воды.
6. Не давай инвестиционных или финансовых рекомендаций.
7. НЕ добавляй раздел «Источники» в конце — он будет добавлен автоматически.

Формат ответа — СТРОГО по разделам (каждый начинается с ## ):

## Куда идёт рынок
Общий вектор развития: тренды, динамика спроса, новые игроки, слияния и поглощения [N].

## Текущая ситуация
Чем дышит рынок сейчас: объёмы строительства, ввод новых мощностей, загрузка существующих ЦОД, крупные сделки [N].

## Что не хватает
Дефициты: оборудование, серверные платформы, энергомощности, подходящие площадки, кадры [N].

## Что мешает
Барьеры: регуляторика, санкции, логистика, стоимость оборудования, длительные сроки поставок [N].

## Планы и анонсы
Новые проекты ЦОД, расширения существующих, анонсированные инвестиции, партнёрства [N].

## Что изменилось с прошлого отчёта
Сравнение с предыдущим отчётом (если он предоставлен) — только то, что действительно изменилось.

## Выводы для строительного бизнеса
Практические выводы: какие возможности открываются для строительных компаний, проектировщиков, инженерных подрядчиков в сегменте ЦОД.`;

// ==================== Endpoints ====================

// POST /api/analytics/generate — запуск генерации доменного отчёта
router.post('/analytics/generate', async (req: Request, res: Response) => {
  try {
    getApiKey();
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const domain = (req.body.domain as string) || '';
  if (!['energy', 'digital', 'datacenters'].includes(domain)) {
    res.status(400).json({ error: 'domain должен быть "energy", "digital" или "datacenters"' });
    return;
  }

  const daysBack = validateInt(req.body.daysBack, 1, 365, 30);
  const domainLabel = domain === 'energy' ? 'Энергетика' : domain === 'digital' ? 'Цифровизация' : 'Рынок ЦОДов';

  // Проверка: не более 1 отчёта в день на домен
  const latest = getLatestAnalyticsReport(domain);
  if (latest && latest.createdAt) {
    const reportDate = new Date(latest.createdAt).toDateString();
    const today = new Date().toDateString();
    if (reportDate === today) {
      res.status(409).json({ error: `Отчёт для «${domainLabel}» за сегодня уже сгенерирован. Приходите завтра.` });
      return;
    }
  }

  // Загружаем статьи через классификацию (SQL) вместо keyword-фильтрации
  const { articles } = readArticlesByDomain(domain as ArticleDomain, daysBack, 500, 0);
  if (articles.length === 0) {
    res.json({ jobId: '', message: `Нет статей по тематике «${domainLabel}» за выбранный период.` });
    return;
  }

  const relevant = articles;
  const jobId = createJob(domain, 3);
  res.json({ jobId, domain, total: relevant.length, message: `Генерация отчёта запущена (${relevant.length} статей)` });

  // Асинхронная генерация
  (async () => {
    try {
      updateJob(jobId, { done: 1, currentItem: `Поиск статей по тематике «${domainLabel}»...` });

      // Получаем предыдущий отчёт для контекста (память)
      const previousReport = getLatestAnalyticsReport(domain);
      let prevContext = '';
      if (previousReport) {
        prevContext = `\n\n=== ПРЕДЫДУЩИЙ ОТЧЁТ от ${previousReport.createdAt?.slice(0, 10) || 'неизвестно'} ===\n${previousReport.content.slice(0, 2000)}\n=== КОНЕЦ ПРЕДЫДУЩЕГО ОТЧЁТА ===\n\nВАЖНО: в разделе «Что изменилось с прошлого отчёта» сравни текущую ситуацию с тем, что описано выше. Укажи, какие события получили развитие, какие новые появились, какие проблемы решились или усугубились.`;
      }

      updateJob(jobId, { done: 2, currentItem: 'Формирование контекста и отправка AI...' });

      // Сортируем статьи по дате
      const sorted = [...relevant].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

      // Формируем текст для AI: заголовок + первые 600 символов текста
      const articlesText = sorted.map((a: any, i: number) =>
        `${i + 1}. [${a.sourceName}] ${a.publishedAt?.slice(0, 10)} — ${a.title}\n${a.bodyText?.slice(0, 600).trim()}`
      ).join('\n\n');

      const systemPrompt = domain === 'energy' ? ENERGY_SYSTEM_PROMPT : domain === 'digital' ? DIGITAL_SYSTEM_PROMPT : DATACENTER_SYSTEM_PROMPT;
      const userPrompt = `Проанализируй следующие новости по тематике «${domainLabel}» за ${daysBack} дней (${sorted.length} статей):\n\n${articlesText.slice(0, 20000)}${prevContext}`;

      const reportContent = await callDeepSeek(systemPrompt, userPrompt, 3500);

      // Заменяем [N] на кликабельные ссылки прямо в тексте
      const withInlineLinks = reportContent.replace(/\[(\d+)\]/g, (fullMatch: string, num: string) => {
        const idx = parseInt(num) - 1;
        const article = sorted[idx];
        if (article?.url) {
          return `[[${num}]](${article.url})`;
        }
        return fullMatch;
      });

      // Добавляем блок источников со ссылками (для удобной навигации)
      const sourcesBlock = '\n\n## Источники\n\n' + sorted.map((a: any, i: number) =>
        `${i + 1}. **[${a.sourceName}]** ${a.title} — [читать](${a.url})`
      ).join('\n');

      const fullContent = withInlineLinks + sourcesBlock;

      // Сохраняем отчёт в БД
      const now = new Date();
      const periodStart = new Date(now.getTime() - daysBack * 86400000).toISOString().slice(0, 10);
      const periodEnd = now.toISOString().slice(0, 10);

      saveAnalyticsReport({
        domain: domain as 'energy' | 'digital' | 'datacenters',
        title: `${domainLabel}: отчёт за ${daysBack} дн. (${now.toLocaleDateString('ru-RU')})`,
        content: fullContent,
        periodStart,
        periodEnd,
        previousReportId: previousReport?.id || null,
        articleCount: sorted.length,
      });

      updateJob(jobId, { status: 'done', done: 3, currentItem: 'Отчёт сгенерирован', result: fullContent });
      logger.info(`Доменный отчёт "${domainLabel}" сохранён (${sorted.length} статей, ${daysBack} дн.)`);
    } catch (err: any) {
      updateJob(jobId, { status: 'error', error: err.message });
      logger.error(`Ошибка генерации отчёта "${domainLabel}": ${err.message}`);
    }
  })().catch(err => updateJob(jobId, { status: 'error', error: err.message }));
});

// GET /api/analytics/status — прогресс генерации
router.get('/analytics/status', (req: Request, res: Response) => {
  const { jobId } = req.query;
  const job = jobId ? jobs.get(String(jobId)) : null;
  if (!job) {
    const running = Array.from(jobs.values()).find(j => j.status === 'running' && j.type === 'domain_analytics');
    res.json({ job: running || null });
    return;
  }
  res.json({ job });
});

// GET /api/analytics/reports/:domain — история отчётов по домену
router.get('/analytics/reports/:domain', (req: Request, res: Response) => {
  const domain = req.params.domain as string;
  if (!['energy', 'digital', 'datacenters'].includes(domain)) {
    res.status(400).json({ error: 'domain должен быть "energy", "digital" или "datacenters"' });
    return;
  }
  const reports = getAnalyticsReportHistory(domain, 20);
  res.json({ domain, reports });
});

// GET /api/analytics/reports/:domain/latest — последний отчёт
router.get('/analytics/reports/:domain/latest', (req: Request, res: Response) => {
  const domain = req.params.domain as string;
  if (!['energy', 'digital', 'datacenters'].includes(domain)) {
    res.status(400).json({ error: 'domain должен быть "energy", "digital" или "datacenters"' });
    return;
  }
  const report = getLatestAnalyticsReport(domain);
  res.json({ domain, report });
});

// GET /api/analytics/relevance/:domain — проверка наличия статей по домену
router.get('/analytics/relevance/:domain', (req: Request, res: Response) => {
  const domain = req.params.domain as string;
  if (!['energy', 'digital', 'datacenters'].includes(domain)) {
    res.status(400).json({ error: 'domain должен быть "energy", "digital" или "datacenters"' });
    return;
  }

  const daysBack = parseInt(req.query.days as string, 10) || 30;
  const { total, articles } = readArticlesByDomain(domain as ArticleDomain, daysBack, 1000, 0);

  res.json({
    domain,
    daysBack,
    totalArticles: total,
    relevantCount: articles.length,
    hasData: articles.length > 0,
  });
});

// ==================== Classification endpoints ====================

import { classifyUnclassifiedArticles, ClassifyResult } from '../classifier.js';

// POST /api/classify — ручной запуск AI-классификации
router.post('/classify', async (req: Request, res: Response) => {
  try {
    getApiKey();
  } catch (e: any) { res.status(500).json({ error: e.message }); return; }

  const daysBack = req.body.daysBack ? parseInt(req.body.daysBack, 10) : undefined;

  try {
    const result: ClassifyResult = await classifyUnclassifiedArticles(daysBack);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/classify/status — статистика классификации
router.get('/classify/status', (_req: Request, res: Response) => {
  try {
    const stats = getClassificationStats();
    res.json({ ok: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
