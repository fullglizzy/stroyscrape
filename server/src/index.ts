// ============================================================
// Express-сервер + инициализация БД
// ============================================================

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import scraperRoutes from './routes/scraper.js';
import summarizeRoutes, { EXTRACT_METRICS_PROMPT } from './routes/summarize.js';
import { readStatus, writeStatus, getDb } from './db.js';
import { runScrape } from './scraper/index.js';
import { refreshBenchmarks } from './benchmarks.js';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализируем БД при старте
getDb();
console.log('📦 SQLite база данных инициализирована');

// Сбрасываем зависший статус
const staleStatus = readStatus();
if (staleStatus.running) {
  console.log('⚠️ Обнаружен зависший статус парсинга — сбрасываю');
  staleStatus.running = false;
  staleStatus.progress.currentStep = 'Сброшено при перезапуске сервера';
  writeStatus(staleStatus);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api', scraperRoutes);
app.use('/api', summarizeRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Статика React (production)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log('📦 Статика: client/dist найден');
} else {
  console.log('⚠️ client/dist не найден — запустите npm run build');
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
  console.log(`\n🔨 Stroyscrape server running at http://localhost:${PORT}`);

  // Бенчмарки при старте
  refreshBenchmarks().catch(() => {});
  // И раз в сутки
  cron.schedule('0 6 * * *', () => refreshBenchmarks().catch(() => {}));

  // Автопарсинг по расписанию: каждые 3 часа
  if (process.env.AUTO_SCRAPE !== 'false') {
    cron.schedule('0 */3 * * *', async () => {
      console.log('[cron] Запуск автоматического парсинга...');
      const status = readStatus();
      if (status.running) { console.log('[cron] Парсинг уже запущен, пропускаю'); return; }
      try {
        const daysBack = parseInt(process.env.DAYS_BACK || '7', 10);
        await runScrape(daysBack);
        console.log('[cron] Автопарсинг завершён');

        // Авто-экстракция метрик если есть API-ключ
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (apiKey) {
          console.log('[cron] Запуск авто-экстракции метрик...');
          try {
            const { readArticles } = await import('./db.js');
            const { articles } = readArticles(undefined, daysBack, 500, 0);
            if (articles.length > 0) {
              // Простой вызов: прогоняем статьи через AI
              const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';
              const { writeMetrics } = await import('./db.js');
              const metrics: any[] = [];
              for (const article of articles.slice(0, 50)) { // первые 50 статей
                try {
                  const res = await fetch(DEEPSEEK_API, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                      model: 'deepseek-chat',
                      messages: [
                        { role: 'system', content: EXTRACT_METRICS_PROMPT },
                        { role: 'user', content: `Заголовок: ${article.title}\nТекст: ${article.bodyText.slice(0, 2000)}` },
                      ],
                      max_tokens: 500, temperature: 0.3,
                    }),
                  });
                  const data = await res.json() as any;
                  const raw = data.choices?.[0]?.message?.content || '';
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
                } catch { /* skip failed */ }
                await new Promise(r => setTimeout(r, 500));
              }
              if (metrics.length > 0) { writeMetrics(metrics); console.log(`[cron] Авто-метрики: ${metrics.length}`); }
            }
          } catch (e: any) { console.error('[cron] Ошибка авто-метрик:', e.message); }
        }
      } catch (err: any) { console.error('[cron] Ошибка автопарсинга:', err.message); }
    });
    console.log('⏰ Автопарсинг: каждые 3 часа');
  }
});
