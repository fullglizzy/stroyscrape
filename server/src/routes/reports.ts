// ============================================================
// Управление отчётами — просмотр, удаление
// ============================================================

import { Router, Request, Response } from 'express';
import {
  getAllAnalyticsReports,
  getAnalyticsReportById,
  deleteAnalyticsReport,
  getAnalyticsReportHistory,
  getLatestAnalyticsReport,
} from '../db.js';

const router = Router();

// GET /api/reports — список всех отчётов
router.get('/reports', (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
    const domain = req.query.domain as string | undefined;

    if (domain && ['energy', 'digital', 'datacenters'].includes(domain)) {
      const reports = getAnalyticsReportHistory(domain, limit);
      res.json({ total: reports.length, reports });
    } else {
      const result = getAllAnalyticsReports(limit, offset);
      res.json(result);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка получения отчётов' });
  }
});

// GET /api/reports/:id — один отчёт
router.get('/reports/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID отчёта должен быть числом' });
      return;
    }
    const report = getAnalyticsReportById(id);
    if (!report) {
      res.status(404).json({ error: 'Отчёт не найден' });
      return;
    }
    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка получения отчёта' });
  }
});

// DELETE /api/reports/:id — удалить отчёт
router.delete('/reports/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID отчёта должен быть числом' });
      return;
    }

    // Проверяем существование
    const report = getAnalyticsReportById(id);
    if (!report) {
      res.status(404).json({ error: 'Отчёт не найден' });
      return;
    }

    const deleted = deleteAnalyticsReport(id);
    if (deleted) {
      res.json({ ok: true, message: `Отчёт #${id} удалён`, deleted: report });
    } else {
      res.status(500).json({ error: 'Не удалось удалить отчёт' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка удаления отчёта' });
  }
});

export default router;
