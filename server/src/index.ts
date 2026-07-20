// ============================================================
// Express-сервер + инициализация БД
// ============================================================

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import scraperRoutes from './routes/scraper.js';
import summarizeRoutes from './routes/summarize.js';
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

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(clientDist, 'index.html'));
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
      if (status.running) {
        console.log('[cron] Парсинг уже запущен, пропускаю');
        return;
      }
      try {
        const daysBack = parseInt(process.env.DAYS_BACK || '7', 10);
        await runScrape(daysBack);
        console.log('[cron] Автопарсинг завершён');
      } catch (err: any) {
        console.error('[cron] Ошибка автопарсинга:', err.message);
      }
    });
    console.log('⏰ Автопарсинг: каждые 3 часа');
  }
});
