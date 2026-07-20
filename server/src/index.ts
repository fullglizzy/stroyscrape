// ============================================================
// Express-сервер: API + раздача статики React
// ============================================================

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import scraperRoutes from './routes/scraper.js';
import summarizeRoutes from './routes/summarize.js';
import { readStatus, writeStatus } from './scraper/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// API-роуты
app.use('/api', scraperRoutes);
app.use('/api', summarizeRoutes);

// Раздача React (production) или прокси (dev)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback — все не-API запросы → index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Сбрасываем зависший статус (если сервер упал во время парсинга)
const staleStatus = readStatus();
if (staleStatus.running) {
  console.log('⚠️ Обнаружен зависший статус парсинга — сбрасываю');
  staleStatus.running = false;
  staleStatus.progress.currentStep = 'Сброшено при перезапуске сервера';
  writeStatus(staleStatus);
}

app.listen(PORT, () => {
  console.log(`\n🔨 Stroyscrape server running at http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/scrape`);
  console.log(`   Статус: http://localhost:${PORT}/api/scrape/status`);
  console.log(`   Статьи: http://localhost:${PORT}/api/articles\n`);
});
