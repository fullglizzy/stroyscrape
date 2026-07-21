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

  // Фаза 2: AI-фильтрация мусора (если есть API-ключ и собраны статьи)
  if (allArticles.length > 0 && !signal.aborted) {
    try {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (apiKey) {
        status.progress.currentStep = 'AI фильтрует нестроительные статьи...';
        writeStatus(status);
        const filtered = await aiFilterArticles(allArticles, apiKey);
        const removed = allArticles.length - filtered.length;
        if (removed > 0) {
          console.log(`\n🤖 AI отфильтровал: ${removed} мусорных статей из ${allArticles.length}`);
          // Обновляем results: убираем отфильтрованные статьи из source-массивов
          const keepIds = new Set(filtered.map(a => a.id));
          for (const r of results) {
            r.articles = r.articles.filter(a => keepIds.has(a.id));
          }
          allArticles.length = 0;
          allArticles.push(...filtered);
        } else {
          console.log(`\n🤖 AI проверил ${allArticles.length} статей — мусора не найдено`);
        }
      }
    } catch (err: any) {
      console.warn(`\n⚠️ AI-фильтр не сработал (${err.message}), оставляем всё как есть`);
    }
  }

  // Фаза 3: запись в БД
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
// AI-фильтр: один запрос → все заголовки → только строительные
// ============================================================

async function aiFilterArticles(articles: Article[], apiKey: string): Promise<Article[]> {
  const titles = articles.map((a, i) => `${i + 1}. ${a.title.replace(/\n/g, ' ').slice(0, 150)}`).join('\n');

  const prompt = `Ниже список заголовков новостей. Оставь ТОЛЬКО те, которые относятся к строительной отрасли, недвижимости, ипотеке, ЖКХ, архитектуре, градостроительству, реновации, стройматериалам.

НЕ строительные темы (удалить): спорт, культура, погода, ДТП, криминал, политика (не связанная со стройкой), развлечения, мода, еда, здоровье, IT (не связанное со стройкой).

Верни ТОЛЬКО JSON-массив с номерами строк (начиная с 1), которые ОСТАВИТЬ.
Пример: [1,3,5,7,12]
Если весь список строительный — верни все номера.
Если ни одной строительной — верни [].

Заголовки:\n${titles}`;

  console.log(`[AI-фильтр] Отправка ${articles.length} заголовков на проверку...`);

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Ты — фильтр. Верни ТОЛЬКО JSON-массив чисел. Ни одного слова.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0,
    }),
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json() as any;
  let raw = (data.choices?.[0]?.message?.content || '[]').trim();

  // Очищаем markdown-обёртку если есть
  raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Пробуем распарсить как есть
  let keepIndices: number[] = [];
  try {
    keepIndices = JSON.parse(raw);
  } catch {
    // Ищем что-то похожее на массив и пробуем закрыть если обрезано
    const start = raw.indexOf('[');
    if (start >= 0) {
      let chunk = raw.slice(start);
      // Если нет закрывающей скобки — добавляем
      if (!chunk.endsWith(']')) {
        const lastComma = chunk.lastIndexOf(',');
        chunk = chunk.slice(0, lastComma >= 0 ? lastComma : chunk.length) + ']';
      }
      try { keepIndices = JSON.parse(chunk); } catch { /* ниже */ }
    }
  }

  if (keepIndices.length === 0) throw new Error(`Не смогли распарсить: ${raw.slice(0, 100)}`);

  const kept = keepIndices.map(i => articles[i - 1]).filter(Boolean);
  return kept;
}

/** CLI-режим: запуск из командной строки */
export async function runScrapeCLI(daysBack: number = 7): Promise<void> {
  console.log('=== Строительный новостной парсер ===');
  console.log(`Источников: ${SOURCES.length}, глубина: ${daysBack} дн.\n`);
  await runScrape(daysBack);
}
