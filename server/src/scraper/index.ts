// ============================================================
// Оркестратор: запуск всех scraper'ов, статус, результат
// ============================================================

import { Article, ScrapeError, ScrapeStatus, ScraperResult } from '../types.js';
import { SOURCES } from './config.js';
import { writeArticles, writeStatus, writeErrors } from '../db.js';
import { BaseScraper } from './base.js';

import { StroygazScraper } from './sources/stroygaz.js';
import { RbcRealtyScraper } from './sources/rbc-realty.js';
import { RcmmScraper } from './sources/rcmm.js';
import { IrnScraper } from './sources/irn.js';
import { StroiMosScraper } from './sources/stroi-mos.js';
import { MperspektivaScraper } from './sources/mperspektiva.js';
import { MinstroyrfScraper } from './sources/minstroyrf.js';
import { AncbScraper } from './sources/ancb.js';
import { MosStroinadzorScraper } from './sources/mos-stroinadzor.js';
import { GenericRssScraper } from './sources/generic-rss.js';

/** Глобальный AbortController для остановки парсинга */
let currentAbortController: AbortController | null = null;

/** Остановить текущий парсинг */
export function stopScrape(): boolean {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    return true;
  }
  return false;
}

/** Фабрика: создать scraper по конфигу */
function createScraper(config: (typeof SOURCES)[number]): BaseScraper {
  switch (config.id) {
    case 'stroygaz': return new StroygazScraper(config);
    case 'rbc_realty': return new RbcRealtyScraper(config);
    case 'rcmm': return new RcmmScraper(config);
    case 'irn': return new IrnScraper(config);
    case 'stroi_mos': return new StroiMosScraper(config);
    case 'mperspektiva': return new MperspektivaScraper(config);
    case 'minstroyrf': return new MinstroyrfScraper(config);
    case 'ancb': return new AncbScraper(config);
    case 'mos_stroinadzor': return new MosStroinadzorScraper(config);
    case 'cnews': case 'servernews': case 'comnews': return new GenericRssScraper(config);
    default: throw new Error(`Unknown source: ${config.id}`);
  }
}

/** Основная функция: запустить парсинг всех или одного источника */
export async function runScrape(daysBack: number = 7, sourceId?: string): Promise<ScraperResult[]> {
  const sourcesToRun = sourceId
    ? SOURCES.filter(s => s.id === sourceId)
    : SOURCES;

  if (sourcesToRun.length === 0) {
    console.error(`Источник "${sourceId}" не найден`);
    return [];
  }

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const status: ScrapeStatus = {
    running: true,
    startedAt: new Date().toISOString(),
    progress: {
      totalSources: sourcesToRun.length,
      doneSources: 0,
      totalArticles: 0,
      currentSource: '',
      currentStep: `Начинаю парсинг${sourceId ? ` источника ${sourceId}` : ''}...`,
    },
    lastRun: null,
    errors: [],
  };
  writeStatus(status);

  const results: ScraperResult[] = [];
  const allArticles: Article[] = [];

  // Фаза 1: сбор статей со всех источников
  for (const sourceConfig of sourcesToRun) {
    if (signal.aborted) {
      status.progress.currentStep = 'Остановлено пользователем';
      break;
    }
    status.progress.currentSource = sourceConfig.name;
    status.progress.currentStep = `Парсинг ${sourceConfig.name}...`;
    writeStatus(status);

    console.log(`[${sourceConfig.id}] Запуск парсинга...`);
    const scraper = createScraper(sourceConfig);
    scraper.setSignal(signal);

    let sourceArticles: Article[] = [];
    try {
      sourceArticles = await scraper.scrape(daysBack);
      const errors = scraper.getErrors();

      console.log(`[${sourceConfig.id}] Собрано: ${sourceArticles.length} статей, ${errors.length} ошибок`);

      if (sourceArticles.length === 0 && errors.length === 0) {
        const warnMsg = '0 статей без ошибок — возможно изменилась вёрстка сайта, проверьте CSS-селекторы';
        console.warn(`[${sourceConfig.id}] ⚠️ ${warnMsg}`);
        errors.push({ source: sourceConfig.id, message: warnMsg, timestamp: new Date().toISOString() });
      }

      results.push({ source: sourceConfig.id, articles: sourceArticles, errors });
      allArticles.push(...sourceArticles);
      status.errors.push(...errors);
    } catch (err: any) {
      console.error(`[${sourceConfig.id}] Критическая ошибка: ${err.message}`);
      status.errors.push({
        source: sourceConfig.id,
        message: `Критическая ошибка: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    }

    status.progress.doneSources++;
    status.progress.totalArticles = allArticles.length;
    writeStatus(status);
  }

  // Запись в БД
  for (const r of results) {
    if (r.articles.length > 0) writeArticles(r.articles);
    if (r.errors.length > 0) writeErrors(r.errors);
  }

  // Финальный статус
  status.running = false;
  status.lastRun = new Date().toISOString();
  status.progress.currentSource = '';
  status.progress.currentStep = signal.aborted ? 'Остановлено пользователем' : 'Готово';
  status.progress.totalArticles = allArticles.length;
  writeStatus(status);

  currentAbortController = null;

  console.log(`\n✅ Всего сохранено: ${allArticles.length} статей с ${sourcesToRun.length} источников`);
  return results;
}

// ============================================================
/** CLI-режим: запуск из командной строки */
export async function runScrapeCLI(daysBack: number = 7): Promise<void> {
  console.log('=== Строительный новостной парсер ===');
  console.log(`Источников: ${SOURCES.length}, глубина: ${daysBack} дн.\n`);
  await runScrape(daysBack);
}
