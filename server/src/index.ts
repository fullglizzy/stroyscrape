// ============================================================
// Express-сервер + инициализация БД
// ============================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import scraperRoutes from './routes/scraper.js';
import summarizeRoutes from './routes/summarize.js';
import domainAnalyticsRoutes from './routes/domainAnalytics.js';
import { readStatus, writeStatus, getDb, readArticlesByDomain, saveAnalyticsReport, getLatestAnalyticsReport } from './db.js';
import { runScrape } from './scraper/index.js';
import { logger } from './logger.js';
import { classifyUnclassifiedArticles } from './classifier.js';
import type { ArticleDomain } from './types.js';
import cron from 'node-cron';

/** Модель для генерации отчётов (можно deepseek-reasoner для более глубокого анализа) */
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || 'deepseek-chat';
const DEEPSEEK_API = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/chat/completions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализируем БД при старте
getDb();
logger.info('SQLite база данных инициализирована');

// Сбрасываем зависший статус
const staleStatus = readStatus();
if (staleStatus.running) {
  logger.warn('Обнаружен зависший статус парсинга — сбрасываю');
  staleStatus.running = false;
  staleStatus.progress.currentStep = 'Сброшено при перезапуске сервера';
  writeStatus(staleStatus);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Доверять прокси (Vite dev server передаёт X-Forwarded-For)
app.set('trust proxy', 1);

// Rate limiting: 100 запросов в минуту на IP для API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiLimiter);
app.use('/api', scraperRoutes);
app.use('/api', summarizeRoutes);
app.use('/api', domainAnalyticsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
    version: '2.0.0',
  });
});

// Статика React (production)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  logger.info('Статика: client/dist найден');
} else {
  logger.warn('client/dist не найден — запустите npm run build');
}

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>СтройПарсер</title></head>
      <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8fafc;color:#475569">
      <div style="text-align:center"><h1 style="font-size:2rem">🏗️ СтройПарсер</h1><p>Сервер запущен. Выполните <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px">npm run build</code> для сборки интерфейса.</p>
      <p>API: <a href="/api/health" style="color:#2563eb">/api/health</a></p></div></body></html>`);
  }
});

app.listen(PORT, () => {
  logger.info(`Сервер запущен на http://localhost:${PORT}`);

  // Автопарсинг + авто-аналитика
  if (process.env.AUTO_SCRAPE !== 'false') {
    cron.schedule('0 5 * * *', async () => {
      logger.info('[cron] Запуск автоматического парсинга...');
      const status = readStatus();
      if (status.running) { logger.info('[cron] Парсинг уже запущен, пропускаю'); return; }
      try {
        const daysBack = parseInt(process.env.DAYS_BACK || '7', 10);
        await runScrape(daysBack);
        logger.info('[cron] Автопарсинг завершён');

        // После парсинга — аналитика
        if (process.env.DEEPSEEK_API_KEY) {
          logger.info('[cron] Запуск авто-аналитики...');
          await autoGenerateReports();
        }
      } catch (err: any) { logger.error('[cron] Ошибка автопарсинга:', err.message); }
    });
    logger.info('Автопарсинг + аналитика: ежедневно в 8:00 МСК');
  }
});

async function autoGenerateReports() {
  const domains: ArticleDomain[] = ['energy', 'digital', 'datacenters'];
  const domainLabels: Record<string, string> = { energy: 'Энергетика', digital: 'Цифровизация', datacenters: 'Рынок ЦОДов' };
  const daysBack = 7;
  const apiKey = process.env.DEEPSEEK_API_KEY!;

  // Системные промпты импортируем динамически (нужны только они)
  const { ENERGY_SYSTEM_PROMPT, DIGITAL_SYSTEM_PROMPT, DATACENTER_SYSTEM_PROMPT } = await import('./routes/domainAnalytics.js');

  for (const domain of domains) {
    try {
      const latest = getLatestAnalyticsReport(domain);
      if (latest?.createdAt && new Date(latest.createdAt).toDateString() === new Date().toDateString()) {
        logger.info(`[cron] Отчёт «${domainLabels[domain]}» за сегодня уже есть`);
        continue;
      }

      // Используем классификацию из БД вместо keyword-фильтрации
      const { articles } = readArticlesByDomain(domain, daysBack, 500, 0);
      if (articles.length === 0) { logger.info(`[cron] Нет статей «${domainLabels[domain]}»`); continue; }

      const sorted = [...articles].sort((a: any, b: any) => b.publishedAt.localeCompare(a.publishedAt));
      const articlesText = sorted.map((a: any, i: number) =>
        `${i + 1}. [${a.sourceName}] ${a.publishedAt?.slice(0, 10)} — ${a.title}\n${(a.bodyText || '').slice(0, 600).trim()}`
      ).join('\n\n');

      const prevReport = getLatestAnalyticsReport(domain);
      const prevContext = prevReport
        ? `\n\n=== ПРЕДЫДУЩИЙ ОТЧЁТ от ${prevReport.createdAt?.slice(0, 10) || '?'} ===\n${prevReport.content.slice(0, 2000)}\n=== КОНЕЦ ===`
        : '';

      const systemPrompt = domain === 'energy' ? ENERGY_SYSTEM_PROMPT : domain === 'digital' ? DIGITAL_SYSTEM_PROMPT : DATACENTER_SYSTEM_PROMPT;
      const userPrompt = `Проанализируй новости «${domainLabels[domain]}» за ${daysBack} дн. (${sorted.length} ст.):\n\n${articlesText.slice(0, 20000)}${prevContext}`;

      logger.info(`[cron] Генерация «${domainLabels[domain]}» (${sorted.length} ст.)...`);

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 120_000);
      const r = await fetch(DEEPSEEK_API, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: ANALYSIS_MODEL, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 3500, temperature: 0.3 }),
      });
      clearTimeout(t);
      const data = await r.json() as any;
      let content = data.choices?.[0]?.message?.content || '';

      // inline links + sources block
      content = content.replace(/\[(\d+)\]/g, (full: string, num: string) => {
        const a = sorted[parseInt(num) - 1];
        return a?.url ? `[[${num}]](${a.url})` : full;
      });
      content += '\n\n## Источники\n\n' + sorted.map((a: any, i: number) =>
        `${i + 1}. **[${a.sourceName}]** ${a.title} — [читать](${a.url})`
      ).join('\n');

      const now = new Date();
      saveAnalyticsReport({
        domain: domain,
        title: `${domainLabels[domain]}: отчёт за ${daysBack} дн. (${now.toLocaleDateString('ru-RU')})`,
        content,
        periodStart: new Date(now.getTime() - daysBack * 86400000).toISOString().slice(0, 10),
        periodEnd: now.toISOString().slice(0, 10),
        previousReportId: prevReport?.id || null,
        articleCount: sorted.length,
      });
      logger.info(`[cron] «${domainLabels[domain]}» сохранён (${sorted.length} ст.)`);
    } catch (err: any) {
      logger.error(`[cron] Ошибка «${domainLabels[domain]}»: ${err.message}`);
    }
  }
}
