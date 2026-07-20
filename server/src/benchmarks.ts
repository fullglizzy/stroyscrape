// ============================================================
// Бенчмарки: официальные данные ЦБ РФ, IRN.RU
// ============================================================

import * as cheerio from 'cheerio';
import { getDb } from './db.js';

// ========== DB ==========

export interface Benchmark {
  source: string;       // 'cbr' | 'irn' | 'rosstat'
  indicator: string;    // 'key_rate' | 'usd_rate' | 'price_m2_msk' | ...
  value: number;
  unit: string;
  date: string;
  fetchedAt: string;
}

export function initBenchmarksTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS benchmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      indicator TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT DEFAULT '',
      date TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      UNIQUE(source, indicator, date)
    );
    CREATE INDEX IF NOT EXISTS idx_benchmarks_indicator ON benchmarks(indicator, date);
  `);
}

export function saveBenchmarks(items: Benchmark[]): number {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO benchmarks (source, indicator, value, unit, date, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let added = 0;
  for (const b of items) {
    const r = insert.run(b.source, b.indicator, b.value, b.unit, b.date, b.fetchedAt);
    if (r.changes > 0) added++;
  }
  return added;
}

export function readBenchmarks(indicator?: string, daysBack: number = 90): Benchmark[] {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let query = 'SELECT * FROM benchmarks WHERE date >= ?';
  const params: any[] = [cutoffStr];
  if (indicator) { query += ' AND indicator = ?'; params.push(indicator); }
  query += ' ORDER BY date DESC';

  return db.prepare(query).all(...params) as Benchmark[];
}

// ========== Fetchers ==========

/** ЦБ РФ — ключевая ставка (из пресс-релизов / справочной страницы) */
export async function fetchCBRKeyRate(): Promise<Benchmark | null> {
  try {
    // Парсим страницу ключевой ставки ЦБ
    const res = await fetch('https://www.cbr.ru/hd_base/KeyRate/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    // Ищем таблицу с данными — последняя строка содержит текущую ставку
    const rows = $('table.data tr');
    let latestValue = 0;
    let latestDate = '';

    rows.each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const dateText = $(cells[0]).text().trim();
        const valueText = $(cells[1]).text().trim().replace(',', '.');
        const val = parseFloat(valueText);
        if (!isNaN(val) && val > 0 && dateText.match(/\d{2}\.\d{2}\.\d{4}/)) {
          if (!latestDate || dateText > latestDate) {
            latestDate = dateText;
            latestValue = val;
          }
        }
      }
    });

    if (latestValue > 0) {
      const [d, m, y] = latestDate.split('.');
      return {
        source: 'cbr', indicator: 'key_rate', value: latestValue, unit: '%',
        date: `${y}-${m}-${d}T00:00:00+03:00`, fetchedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('[benchmarks] CBR key rate fetch failed:', (err as Error).message);
  }
  return null;
}

/** ЦБ РФ — курс USD */
export async function fetchCBRUSDRate(): Promise<Benchmark | null> {
  try {
    const res = await fetch('https://www.cbr.ru/scripts/XML_daily.asp', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const xml = await res.text();
    // Ищем USD: <Valute ID="R01235"><Value>78,40</Value></Valute>
    const usdMatch = xml.match(/<Valute ID="R01235">[\s\S]*?<Value>([\d,]+)<\/Value>/);
    if (usdMatch) {
      return {
        source: 'cbr', indicator: 'usd_rate', value: parseFloat(usdMatch[1].replace(',', '.')),
        unit: '₽', date: new Date().toISOString().slice(0, 10) + 'T00:00:00+03:00',
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('[benchmarks] CBR USD rate fetch failed:', (err as Error).message);
  }
  return null;
}

/** IRN.RU — индексы рынка недвижимости */
export async function fetchIRNIndices(): Promise<Benchmark[]> {
  const results: Benchmark[] = [];
  try {
    const res = await fetch('https://www.irn.ru/index/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    // Ищем значения индексов на странице
    // IRN.RU показывает: индекс стоимости жилья, индекс цен, и т.д.
    const indexBlocks = $('.index-value, .index-card__value, [class*="index"]');

    const today = new Date().toISOString().slice(0, 10) + 'T00:00:00+03:00';
    const now = new Date().toISOString();

    // Ищем конкретные индикаторы по тексту
    const text = $('body').text();

    // Индекс стоимости жилья (руб/м²)
    const priceMatch = text.match(/(?:средняя цена|стоимость жилья|индекс стоимости)[^\d]*(\d[\d\s]{4,})/i);
    if (priceMatch) {
      results.push({
        source: 'irn', indicator: 'price_m2_msk', value: parseFloat(priceMatch[1].replace(/\s/g, '')),
        unit: '₽/м²', date: today, fetchedAt: now,
      });
    }

    // Индекс цен (пункты)
    const idxMatch = text.match(/(?:индекс цен|ценовой индекс)[^\d]*(\d[\d\s]*[.,]?\d*)/i);
    if (idxMatch) {
      results.push({
        source: 'irn', indicator: 'price_index', value: parseFloat(idxMatch[1].replace(/\s/g, '').replace(',', '.')),
        unit: 'пункты', date: today, fetchedAt: now,
      });
    }
  } catch (err) {
    console.error('[benchmarks] IRN fetch failed:', (err as Error).message);
  }
  return results;
}

/** Запуск всех fetcher'ов и сохранение */
export async function refreshBenchmarks(): Promise<Benchmark[]> {
  initBenchmarksTable();
  const results: Benchmark[] = [];

  const cbrKey = await fetchCBRKeyRate();
  if (cbrKey) results.push(cbrKey);

  const cbrUsd = await fetchCBRUSDRate();
  if (cbrUsd) results.push(cbrUsd);

  const irn = await fetchIRNIndices();
  results.push(...irn);

  if (results.length > 0) {
    const added = saveBenchmarks(results);
    console.log(`[benchmarks] Сохранено: ${added} из ${results.length}`);
  }

  return results;
}
