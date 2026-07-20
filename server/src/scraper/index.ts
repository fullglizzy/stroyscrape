// ============================================================
// Оркестратор: запуск всех scraper'ов, статус, результат
// ============================================================

import { Article, ScrapeError, ScrapeStatus, ScraperResult } from '../types.js';
import { SOURCES } from './config.js';
import { readStatus, writeStatus, writeArticles } from './output.js';
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
    default: throw new Error(`Unknown source: ${config.id}`);
  }
}

/** Основная функция: запустить парсинг всех источников */
export async function runScrape(daysBack: number = 7): Promise<ScraperResult[]> {
  const status: ScrapeStatus = {
    running: true,
    startedAt: new Date().toISOString(),
    progress: {
      totalSources: SOURCES.length,
      doneSources: 0,
      totalArticles: 0,
      currentSource: '',
      currentStep: 'Начинаю парсинг...',
    },
    lastRun: null,
    errors: [],
  };
  writeStatus(status);

  const results: ScraperResult[] = [];
  const allArticles: Article[] = [];

  // Запускаем scraper'ы последовательно (не параллельно — чтобы не нагружать сеть)
  for (const sourceConfig of SOURCES) {
    status.progress.currentSource = sourceConfig.name;
    status.progress.currentStep = `Парсинг ${sourceConfig.name}...`;
    writeStatus(status);

    console.log(`[${sourceConfig.id}] Запуск парсинга...`);
    const scraper = createScraper(sourceConfig);

    let sourceArticles: Article[] = [];

    try {
      sourceArticles = await scraper.scrape(daysBack);
      const errors = scraper.getErrors();

      console.log(`[${sourceConfig.id}] Готово: ${sourceArticles.length} статей, ${errors.length} ошибок`);

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

    // Инкрементально сохраняем статьи после каждого источника
    if (sourceArticles.length > 0) {
      writeArticles(sourceArticles);
    }
  }

  // Финальный статус
  status.running = false;
  status.lastRun = new Date().toISOString();
  status.progress.currentSource = '';
  status.progress.currentStep = 'Готово';
  writeStatus(status);

  console.log(`\nВсего собрано: ${allArticles.length} статей с ${SOURCES.length} источников`);
  return results;
}

/** CLI-режим: запуск из командной строки */
export async function runScrapeCLI(daysBack: number = 7): Promise<void> {
  console.log('=== Строительный новостной парсер ===');
  console.log(`Источников: ${SOURCES.length}, глубина: ${daysBack} дн.\n`);
  await runScrape(daysBack);
}
