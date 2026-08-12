// ============================================================
// SQLite Database Layer — замена JSON-файлов
// ============================================================

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { Article, ArticleDomain, ScrapeStatus, ScrapeError } from './types.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'stroyscrape.db');

/** ID источников, отключённых через env SOURCES_DISABLED */
function getDisabledSourceIds(): string[] {
  return (process.env.SOURCES_DISABLED || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables(): void {
  const d = db;

  d.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_name TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      published_at TEXT NOT NULL,
      author TEXT,
      body_text TEXT NOT NULL,
      summary TEXT,
      image_url TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      fetched_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
    CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_fetched ON articles(fetched_at);

    -- Миграция: колонка AI-классификации
    `);
  try { d.exec('ALTER TABLE articles ADD COLUMN classification TEXT NOT NULL DEFAULT \'[]\''); } catch { /* уже существует */ }
  try { d.exec('CREATE INDEX IF NOT EXISTS idx_articles_classification ON articles(classification)'); } catch { /* ок */ }

  d.exec(`

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT REFERENCES articles(id),
      metric_name TEXT NOT NULL,
      metric_value TEXT,
      direction TEXT CHECK(direction IN ('up','down','flat','unknown')),
      segment TEXT,
      region TEXT,
      confidence REAL DEFAULT 0.5,
      raw_context TEXT,
      extracted_at TEXT NOT NULL,
	      UNIQUE(article_id, metric_name)
	    );
	  `);

	  // Migration: add unit column if missing
	  try { d.exec('ALTER TABLE metrics ADD COLUMN unit TEXT DEFAULT \'\''); } catch { /* already exists */ }

	  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
    CREATE INDEX IF NOT EXISTS idx_metrics_article ON metrics(article_id);

    CREATE TABLE IF NOT EXISTS scrape_status (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      running INTEGER DEFAULT 0,
      started_at TEXT,
      total_sources INTEGER DEFAULT 0,
      done_sources INTEGER DEFAULT 0,
      total_articles INTEGER DEFAULT 0,
      current_source TEXT DEFAULT '',
      current_step TEXT DEFAULT '',
      last_run TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO scrape_status (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS scrape_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      url TEXT,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('daily','weekly','forecast')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Миграция/создание analytics_reports
  // При изменении списка доменов — таблица пересоздаётся (данных нет на старте)
  try {
    const info = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='analytics_reports'").get() as any;
    if (info && info.sql && !info.sql.includes("'digital'")) {
      d.exec('DROP TABLE IF EXISTS analytics_reports');
    }
  } catch { /* ок */ }
  d.exec(`
    CREATE TABLE IF NOT EXISTS analytics_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL CHECK(domain IN ('energy','digital','datacenters')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      previous_report_id INTEGER REFERENCES analytics_reports(id),
      article_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_analytics_reports_domain ON analytics_reports(domain, created_at DESC)');
}

// ========== Articles CRUD ==========

export function readArticles(source?: string, daysBack?: number, limit?: number, offset?: number): { total: number; articles: Article[] } {
  const d = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  // Фильтруем отключённые источники
  const disabledIds = getDisabledSourceIds();
  if (disabledIds.length > 0) {
    conditions.push(`source NOT IN (${disabledIds.map(() => '?').join(',')})`);
    params.push(...disabledIds);
  }

  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }

  if (daysBack && daysBack > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    conditions.push('published_at >= ?');
    params.push(cutoff.toISOString().slice(0, 10));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = d.prepare(`SELECT COUNT(*) as cnt FROM articles ${where}`).get(...params) as any;
  const total = countRow?.cnt || 0;

  const rows = d.prepare(
    `SELECT * FROM articles ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit || 100, offset || 0) as any[];

  const articles: Article[] = rows.map(row => ({
    id: row.id,
    source: row.source,
    sourceName: row.source_name,
    url: row.url,
    title: row.title,
    publishedAt: row.published_at,
    author: row.author,
    bodyText: row.body_text,
    summary: row.summary,
    imageUrl: row.image_url,
    tags: JSON.parse(row.tags || '[]'),
    classification: safeJsonParse(row.classification, []),
    fetchedAt: row.fetched_at,
  }));

  return { total, articles };
}

function safeJsonParse(raw: string | null | undefined, fallback: any): any {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function readArticleById(id: string): Article | null {
  const d = getDb();
  const row = d.prepare('SELECT * FROM articles WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    sourceName: row.source_name,
    url: row.url,
    title: row.title,
    publishedAt: row.published_at,
    author: row.author,
    bodyText: row.body_text,
    summary: row.summary,
    imageUrl: row.image_url,
    tags: JSON.parse(row.tags || '[]'),
    classification: safeJsonParse(row.classification, []),
    fetchedAt: row.fetched_at,
  };
}

export function writeArticles(articles: Article[]): number {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO articles (id, source, source_name, url, title, published_at, author, body_text, summary, image_url, tags, classification, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = d.transaction((items: Article[]) => {
    let added = 0;
    for (const a of items) {
      const result = insert.run(
        a.id, a.source, a.sourceName, a.url, a.title, a.publishedAt,
        a.author, a.bodyText, a.summary, a.imageUrl, JSON.stringify(a.tags),
        JSON.stringify(a.classification || []), a.fetchedAt
      );
      if (result.changes > 0) added++;
    }
    return added;
  });

  return insertMany(articles);
}

export function getSourceStats(): Record<string, { name: string; count: number; lastArticle: string | null }> {
  const d = getDb();
  const rows = d.prepare(`
    SELECT source, source_name, COUNT(*) as cnt, MAX(published_at) as last_pub
    FROM articles GROUP BY source ORDER BY cnt DESC
  `).all() as any[];

  const disabledIds = getDisabledSourceIds();
  const stats: Record<string, any> = {};
  for (const r of rows) {
    if (disabledIds.includes(r.source)) continue;
    stats[r.source] = { name: r.source_name, count: r.cnt, lastArticle: r.last_pub };
  }
  return stats;
}

export function removeArticlesBySource(source: string): number {
  const d = getDb();
  const result = d.prepare('DELETE FROM articles WHERE source = ?').run(source);
  return result.changes;
}

/** Удалить статьи за указанный диапазон дат (published_at) */
export function deleteArticlesByDateRange(from: string, to: string): { deleted: number; sourceBreakdown: Record<string, number> } {
  const d = getDb();

  // Сначала считаем разбивку по источникам для отчёта
  const breakdown = d.prepare(`
    SELECT source, source_name, COUNT(*) as cnt
    FROM articles
    WHERE published_at >= ? AND published_at <= ?
    GROUP BY source
    ORDER BY cnt DESC
  `).all(from, to) as any[];

  const sourceBreakdown: Record<string, number> = {};
  for (const r of breakdown) {
    sourceBreakdown[r.source] = r.cnt;
  }

  const result = d.prepare(
    'DELETE FROM articles WHERE published_at >= ? AND published_at <= ?'
  ).run(from, to);

  return { deleted: result.changes, sourceBreakdown };
}

/** Удалить ВСЕ статьи */
export function deleteAllArticles(): { deleted: number } {
  const d = getDb();
  const total = (d.prepare('SELECT COUNT(*) as cnt FROM articles').get() as any)?.cnt || 0;
  d.prepare('DELETE FROM articles').run();
  return { deleted: total };
}

// ========== Scrape Status ==========

export function readStatus(): ScrapeStatus {
  const d = getDb();
  const row = d.prepare('SELECT * FROM scrape_status WHERE id = 1').get() as any;
  const errors = d.prepare('SELECT * FROM scrape_errors ORDER BY timestamp DESC LIMIT 100').all() as any[];

  return {
    running: row?.running === 1,
    startedAt: row?.started_at || null,
    progress: {
      totalSources: row?.total_sources || 0,
      doneSources: row?.done_sources || 0,
      totalArticles: row?.total_articles || 0,
      currentSource: row?.current_source || '',
      currentStep: row?.current_step || '',
    },
    lastRun: row?.last_run || null,
    errors: errors.map((e: any) => ({
      source: e.source,
      url: e.url,
      message: e.message,
      timestamp: e.timestamp,
    })),
  };
}

export function writeStatus(status: ScrapeStatus): void {
  const d = getDb();
  d.prepare(`
    UPDATE scrape_status SET
      running = ?, started_at = ?, total_sources = ?, done_sources = ?,
      total_articles = ?, current_source = ?, current_step = ?, last_run = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    status.running ? 1 : 0,
    status.startedAt,
    status.progress.totalSources,
    status.progress.doneSources,
    status.progress.totalArticles,
    status.progress.currentSource,
    status.progress.currentStep,
    status.lastRun
  );

  // Очищаем ошибки при новом запуске
  if (status.running && status.progress.doneSources === 0) {
    d.prepare('DELETE FROM scrape_errors').run();
  }
}

export function writeErrors(errors: ScrapeError[]): void {
  const d = getDb();
  const insert = d.prepare('INSERT INTO scrape_errors (source, url, message, timestamp) VALUES (?, ?, ?, ?)');
  for (const e of errors) {
    insert.run(e.source, e.url, e.message, e.timestamp);
  }
}

// ========== Metrics ==========

export interface Metric {
  id?: number;
  articleId: string;
  metricName: string;
  metricValue: string;
  unit?: string;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  segment: string;
  region: string;
  confidence: number;
  rawContext: string;
  extractedAt: string;
}

export function writeMetrics(metrics: Metric[]): number {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR REPLACE INTO metrics (article_id, metric_name, metric_value, unit, direction, segment, region, confidence, raw_context, extracted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = d.transaction((items: Metric[]) => {
    let added = 0;
    for (const m of items) {
      const result = insert.run(
        m.articleId, m.metricName, m.metricValue, m.unit || '',
        m.direction, m.segment, m.region, m.confidence, m.rawContext, m.extractedAt
      );
      if (result.changes > 0) added++;
    }
    return added;
  });

  return insertMany(metrics);
}

export function readMetrics(daysBack?: number): Metric[] {
  const d = getDb();
  let query = `
    SELECT m.*, a.title as article_title, a.source_name
    FROM metrics m JOIN articles a ON m.article_id = a.id
  `;
  const params: any[] = [];

  if (daysBack && daysBack > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    query += ` WHERE a.published_at >= ?`;
    params.push(cutoff.toISOString().slice(0, 10));
  }

  query += ` ORDER BY m.extracted_at DESC`;

  const rows = d.prepare(query).all(...params) as any[];
  return rows.map((r: any) => ({
    id: r.id,
    articleId: r.article_id,
    metricName: r.metric_name,
    metricValue: r.metric_value,
    unit: r.unit || '',
    direction: r.direction,
    segment: r.segment,
    region: r.region,
    confidence: r.confidence,
    rawContext: r.raw_context,
    extractedAt: r.extracted_at,
    articleTitle: r.article_title,
    sourceName: r.source_name,
  }));
}

export function getMetricsTrend(metricName: string, daysBack: number = 30): { date: string; value: string; direction: string }[] {
  const d = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const rows = d.prepare(`
    SELECT a.published_at as dt, m.metric_value, m.direction
    FROM metrics m JOIN articles a ON m.article_id = a.id
    WHERE m.metric_name = ? AND a.published_at >= ?
    ORDER BY a.published_at ASC
  `).all(metricName, cutoff.toISOString().slice(0, 10)) as any[];

  return rows.map(r => ({
    date: r.dt.slice(0, 10),
    value: r.metric_value,
    direction: r.direction,
  }));
}

// ========== Classification ==========

/** Обновить классификацию одной статьи */
export function updateArticleClassification(id: string, domains: ArticleDomain[]): void {
  const d = getDb();
  d.prepare('UPDATE articles SET classification = ? WHERE id = ?')
    .run(JSON.stringify(domains), id);
}

/** Получить неклассифицированные статьи (classification = '[]') */
export function getUnclassifiedArticles(limit: number = 500, daysBack?: number): { id: string; title: string; bodyText: string }[] {
  const d = getDb();
  let query = "SELECT id, title, body_text FROM articles WHERE classification = '[]'";
  const params: any[] = [];

  if (daysBack && daysBack > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    query += ' AND published_at >= ?';
    params.push(cutoff.toISOString().slice(0, 10));
  }

  query += ' ORDER BY published_at DESC LIMIT ?';
  params.push(limit);

  const rows = d.prepare(query).all(...params) as any[];
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    bodyText: r.body_text,
  }));
}

/** Статистика классификации по доменам */
export function getClassificationStats(): { domain: string; count: number; unclassified: number }[] {
  const d = getDb();

  const totalRow = d.prepare("SELECT COUNT(*) as cnt FROM articles").get() as any;
  const total = totalRow?.cnt || 0;

  const unclassifiedRow = d.prepare("SELECT COUNT(*) as cnt FROM articles WHERE classification = '[]'").get() as any;
  const unclassified = unclassifiedRow?.cnt || 0;

  const domains = ['energy', 'digital', 'datacenters'];
  return domains.map(domain => {
    const row = d.prepare(
      `SELECT COUNT(*) as cnt FROM articles WHERE classification LIKE ?`
    ).get(`%"${domain}"%`) as any;
    return { domain, count: row?.cnt || 0, unclassified: 0 };
  }).concat([{ domain: 'unclassified', count: unclassified, unclassified }]);
}

/** Получить статьи по домену через classification */
export function readArticlesByDomain(domain: ArticleDomain, daysBack?: number, limit?: number, offset?: number): { total: number; articles: Article[] } {
  const d = getDb();
  const conditions: string[] = [`classification LIKE '%"${domain}"%'`];
  const params: any[] = [];

  if (daysBack && daysBack > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    conditions.push('published_at >= ?');
    params.push(cutoff.toISOString().slice(0, 10));
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = d.prepare(`SELECT COUNT(*) as cnt FROM articles ${where}`).get(...params) as any;
  const total = countRow?.cnt || 0;

  const rows = d.prepare(
    `SELECT * FROM articles ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit || 100, offset || 0) as any[];

  const articles: Article[] = rows.map(row => ({
    id: row.id,
    source: row.source,
    sourceName: row.source_name,
    url: row.url,
    title: row.title,
    publishedAt: row.published_at,
    author: row.author,
    bodyText: row.body_text,
    summary: row.summary,
    imageUrl: row.image_url,
    tags: JSON.parse(row.tags || '[]'),
    classification: safeJsonParse(row.classification, []),
    fetchedAt: row.fetched_at,
  }));

  return { total, articles };
}

// ========== Reports ==========

export interface Report {
  id?: number;
  type: 'daily' | 'weekly' | 'forecast';
  title: string;
  content: string;
  periodStart?: string;
  periodEnd?: string;
  createdAt?: string;
}

export function saveReport(report: Report): number {
  const d = getDb();
  const result = d.prepare(`
    INSERT INTO reports (type, title, content, period_start, period_end)
    VALUES (?, ?, ?, ?, ?)
  `).run(report.type, report.title, report.content, report.periodStart, report.periodEnd);
  return Number(result.lastInsertRowid);
}

export function readReports(type?: string, limit: number = 20): Report[] {
  const d = getDb();
  let query = 'SELECT * FROM reports';
  const params: any[] = [];
  if (type) {
    query += ' WHERE type = ?';
    params.push(type);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = d.prepare(query).all(...params) as any[];
  return rows.map((r: any) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    content: r.content,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    createdAt: r.created_at,
  }));
}

// ========== Analytics Reports (domain-specific) ==========

export interface AnalyticsReport {
  id?: number;
  domain: 'energy' | 'digital' | 'datacenters';
  title: string;
  content: string;
  periodStart?: string;
  periodEnd?: string;
  previousReportId?: number | null;
  articleCount: number;
  createdAt?: string;
}

export function saveAnalyticsReport(report: AnalyticsReport): number {
  const d = getDb();
  const result = d.prepare(`
    INSERT INTO analytics_reports (domain, title, content, period_start, period_end, previous_report_id, article_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(report.domain, report.title, report.content, report.periodStart, report.periodEnd, report.previousReportId || null, report.articleCount);
  return Number(result.lastInsertRowid);
}

export function getLatestAnalyticsReport(domain: string): AnalyticsReport | null {
  const d = getDb();
  const row = d.prepare(
    'SELECT * FROM analytics_reports WHERE domain = ? ORDER BY created_at DESC LIMIT 1'
  ).get(domain) as any;
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    title: row.title,
    content: row.content,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    previousReportId: row.previous_report_id,
    articleCount: row.article_count,
    createdAt: row.created_at,
  };
}

export function getAnalyticsReportHistory(domain: string, limit: number = 20): AnalyticsReport[] {
  const d = getDb();
  const rows = d.prepare(
    'SELECT * FROM analytics_reports WHERE domain = ? ORDER BY created_at DESC LIMIT ?'
  ).all(domain, limit) as any[];
  return rows.map((r: any) => ({
    id: r.id,
    domain: r.domain,
    title: r.title,
    content: r.content,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    previousReportId: r.previous_report_id,
    articleCount: r.article_count,
    createdAt: r.created_at,
  }));
}

/** Получить один аналитический отчёт по ID */
export function getAnalyticsReportById(id: number): AnalyticsReport | null {
  const d = getDb();
  const row = d.prepare('SELECT * FROM analytics_reports WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    title: row.title,
    content: row.content,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    previousReportId: row.previous_report_id,
    articleCount: row.article_count,
    createdAt: row.created_at,
  };
}

/** Удалить аналитический отчёт по ID */
export function deleteAnalyticsReport(id: number): boolean {
  const d = getDb();
  const result = d.prepare('DELETE FROM analytics_reports WHERE id = ?').run(id);
  return result.changes > 0;
}

/** Получить все аналитические отчёты (с пагинацией) */
export function getAllAnalyticsReports(limit: number = 50, offset: number = 0): { total: number; reports: AnalyticsReport[] } {
  const d = getDb();
  const countRow = d.prepare('SELECT COUNT(*) as cnt FROM analytics_reports').get() as any;
  const total = countRow?.cnt || 0;
  const rows = d.prepare(
    'SELECT * FROM analytics_reports ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as any[];
  const reports = rows.map((r: any) => ({
    id: r.id,
    domain: r.domain,
    title: r.title,
    content: r.content,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    previousReportId: r.previous_report_id,
    articleCount: r.article_count,
    createdAt: r.created_at,
  }));
  return { total, reports };
}
