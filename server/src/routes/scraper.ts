// ============================================================
// API-роуты (SQLite версия)
// ============================================================

import { Router, Request, Response } from 'express';
import { readArticles, readStatus, writeStatus, getSourceStats, readArticleById, deleteArticlesByDateRange, deleteAllArticles } from '../db.js';
import { runScrape, stopScrape } from '../scraper/index.js';

const router = Router();

router.post('/scrape', async (req: Request, res: Response) => {
  const status = readStatus();
  if (status.running) {
    res.status(409).json({ error: 'Парсинг уже запущен', status });
    return;
  }
  const { source } = req.body as { source?: string };
  res.json({ ok: true, message: source ? `Парсинг источника "${source}" запущен` : 'Парсинг всех источников запущен', source: source || null });
  const daysBack = parseInt(process.env.DAYS_BACK || '7', 10);
  try {
    await runScrape(daysBack, source);
  } catch (err: any) {
    console.error('Ошибка парсинга:', err.message);
    const s = readStatus();
    s.running = false;
    writeStatus(s);
  }
});

router.get('/scrape/status', (_req: Request, res: Response) => res.json(readStatus()));

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

router.post('/scrape/reset', (_req: Request, res: Response) => {
  stopScrape();
  const s = readStatus();
  s.running = false;
  writeStatus(s);
  res.json({ ok: true, message: 'Статус сброшен' });
});

router.get('/articles', (req: Request, res: Response) => {
  const source = req.query.source as string | undefined;
  const days = parseInt(req.query.days as string, 10) || 0;
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const offset = parseInt(req.query.offset as string, 10) || 0;
  const result = readArticles(source, days, limit, offset);
  res.json(result);
});

router.get('/articles/:id', (req: Request, res: Response) => {
  const article = readArticleById(String(req.params.id));
  if (!article) { res.status(404).json({ error: 'Статья не найдена' }); return; }
  res.json(article);
});

router.get('/sources', (_req: Request, res: Response) => res.json(getSourceStats()));

// DELETE /api/articles?from=YYYY-MM-DD&to=YYYY-MM-DD — удалить статьи за период
router.delete('/articles', (req: Request, res: Response) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');

  if (!from || !to) {
    res.status(400).json({ error: 'Параметры from и to обязательны (формат YYYY-MM-DD)' });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({ error: 'Неверный формат дат. Используйте YYYY-MM-DD' });
    return;
  }

  if (from > to) {
    res.status(400).json({ error: 'from не может быть больше to' });
    return;
  }

  try {
    const result = deleteArticlesByDateRange(from, to);
    res.json({
      ok: true,
      message: `Удалено ${result.deleted} статей за период ${from} — ${to}`,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка удаления статей' });
  }
});

// DELETE /api/articles/all — удалить ВСЕ статьи
router.delete('/articles/all', (_req: Request, res: Response) => {
  try {
    const result = deleteAllArticles();
    res.json({
      ok: true,
      message: `Удалены ВСЕ статьи (${result.deleted} шт.)`,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка удаления статей' });
  }
});

export default router;
