// ============================================================
// Слой работы с данными: чтение/запись JSON
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { Article, ScrapeStatus } from '../types.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const STATUS_FILE = path.join(DATA_DIR, 'status.json');

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Читает все статьи из хранилища */
export function readArticles(): Article[] {
  ensureDir();
  try {
    if (fs.existsSync(ARTICLES_FILE)) {
      const raw = fs.readFileSync(ARTICLES_FILE, 'utf-8');
      return JSON.parse(raw) as Article[];
    }
  } catch {
    console.error('Ошибка чтения articles.json, начинаем с пустого массива');
  }
  return [];
}

/** Записывает статьи в хранилище (слияние: новые дописываются, существующие не дублируются) */
export function writeArticles(newArticles: Article[]): Article[] {
  ensureDir();
  const existing = readArticles();
  const existingIds = new Set(existing.map(a => a.id));

  let added = 0;
  for (const article of newArticles) {
    if (!existingIds.has(article.id)) {
      existing.push(article);
      existingIds.add(article.id);
      added++;
    }
  }

  fs.writeFileSync(ARTICLES_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`Сохранено: +${added} новых, всего ${existing.length} статей`);
  return existing;
}

/** Читает статус парсинга */
export function readStatus(): ScrapeStatus {
  ensureDir();
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')) as ScrapeStatus;
    }
  } catch { /* ignore */ }
  return {
    running: false,
    startedAt: null,
    progress: { totalSources: 0, doneSources: 0, totalArticles: 0, currentSource: '', currentStep: '' },
    lastRun: null,
    errors: [],
  };
}

/** Записывает статус парсинга */
export function writeStatus(status: ScrapeStatus): void {
  ensureDir();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
}
