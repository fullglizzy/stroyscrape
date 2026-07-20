// ============================================================
// API-роуты: /api/scrape, /api/scrape/status, /api/articles
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticles, readStatus, writeStatus } from '../scraper/output.js';
import { runScrape, stopScrape } from '../scraper/index.js';

const router = Router();

// POST /api/scrape — запустить парсинг (всех или одного источника)
router.post('/scrape', async (req: Request, res: Response) => {
  const status = readStatus();

  if (status.running) {
    res.status(409).json({ error: 'Парсинг уже запущен', status });
    return;
  }

  const { source } = req.body as { source?: string };

  // Запускаем асинхронно — не ждём завершения
  res.json({
    ok: true,
    message: source
      ? `Парсинг источника "${source}" запущен`
      : 'Парсинг всех источников запущен',
    source: source || null,
  });

  const daysBack = parseInt(process.env.DAYS_BACK || '7', 10);

  try {
    await runScrape(daysBack, source);
  } catch (err: any) {
    console.error('Ошибка парсинга:', err.message);
    const s = readStatus();
    s.running = false;
    s.errors.push({
      source: 'orchestrator',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
    writeStatus(s);
  }
});

// GET /api/scrape/status — статус парсинга
router.get('/scrape/status', (_req: Request, res: Response) => {
  res.json(readStatus());
});

// POST /api/scrape/stop — остановить парсинг
router.post('/scrape/stop', (_req: Request, res: Response) => {
  const stopped = stopScrape();
  if (stopped) {
    const s = readStatus();
    s.running = false;
    s.progress.currentStep = 'Остановлено пользователем';
    writeStatus(s);
    res.json({ ok: true, message: 'Парсинг остановлен' });
  } else {
    res.status(404).json({ error: 'Нет активного парсинга' });
  }
});

// POST /api/scrape/reset — сбросить зависший статус
router.post('/scrape/reset', (_req: Request, res: Response) => {
  stopScrape(); // на всякий случай
  const s = readStatus();
  s.running = false;
  s.errors = [];
  s.progress.currentStep = 'Сброшено';
  writeStatus(s);
  res.json({ ok: true, message: 'Статус сброшен' });
});

// GET /api/articles — все статьи (с фильтрацией)
router.get('/articles', (req: Request, res: Response) => {
  let articles = readArticles();

  // Фильтр по источнику
  const source = req.query.source as string;
  if (source) {
    articles = articles.filter(a => a.source === source);
  }

  // Фильтр по дням
  const days = parseInt(req.query.days as string, 10);
  if (days && !isNaN(days)) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    articles = articles.filter(a => new Date(a.publishedAt) >= cutoff);
  }

  // Сортировка: свежие сверху
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Пагинация
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const offset = parseInt(req.query.offset as string, 10) || 0;

  const page = articles.slice(offset, offset + limit);

  res.json({
    total: articles.length,
    offset,
    limit,
    articles: page,
  });
});

// GET /api/articles/:id — одна статья
router.get('/articles/:id', (req: Request, res: Response) => {
  const articles = readArticles();
  const article = articles.find(a => a.id === req.params.id);

  if (!article) {
    res.status(404).json({ error: 'Статья не найдена' });
    return;
  }

  res.json(article);
});

// GET /api/sources — список источников
router.get('/sources', (_req: Request, res: Response) => {
  const articles = readArticles();
  const sourceStats: Record<string, { name: string; count: number; lastArticle: string | null }> = {};

  for (const a of articles) {
    if (!sourceStats[a.source]) {
      sourceStats[a.source] = { name: a.sourceName, count: 0, lastArticle: null };
    }
    sourceStats[a.source].count++;
    if (!sourceStats[a.source].lastArticle || a.publishedAt > sourceStats[a.source].lastArticle!) {
      sourceStats[a.source].lastArticle = a.publishedAt;
    }
  }

  res.json(sourceStats);
});

export default router;
