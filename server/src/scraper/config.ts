// ============================================================
// Базовая конфигурация всех 9 источников
// ============================================================

import { SourceConfig } from '../types.js';

/** Все зарегистрированные источники */
const ALL_SOURCES: SourceConfig[] = [
  // ============================
  // RSS-источники (полный текст)
  // ============================
  {
    id: 'stroygaz',
    name: 'Строительная газета',
    baseUrl: 'https://stroygaz.ru',
    method: 'rss',
    rssUrl: 'https://stroygaz.ru/rss/',
    requestDelay: 500,
  },
  {
    id: 'rbc_realty',
    name: 'РБК Недвижимость',
    baseUrl: 'https://realty.rbc.ru',
    method: 'rss',
    rssUrl: 'https://rssexport.rbc.ru/realty/news/30/full.rss',
    requestDelay: 500,
  },
  {
    id: 'rcmm',
    name: 'Строительство.RU',
    baseUrl: 'https://rcmm.ru',
    method: 'rss',
    rssUrl: 'https://rcmm.ru/rss.xml',
    cookie: 'beget=begetok',
    requestDelay: 500,
  },

  // ============================
  // Sitemap-источники
  // ============================
  {
    id: 'irn',
    name: 'IRN.RU — Индикаторы рынка недвижимости',
    baseUrl: 'https://www.irn.ru',
    method: 'sitemap',
    sitemapUrl: 'https://www.irn.ru/xml/sitemap-posts.xml',
    selectors: {
      title: 'h1.post-view-header',
      date: 'time[datetime]',
      body: 'div.post-view-body',
      image: 'meta[property="og:image"]',
    },
    requestDelay: 1000,
  },
  {
    id: 'stroi_mos',
    name: 'Градостроительная политика Москвы',
    baseUrl: 'https://stroi.mos.ru',
    method: 'sitemap',
    sitemapUrl: 'https://stroi.mos.ru/sitemap.xml',
    selectors: {
      title: 'h1',
      date: 'time',
      author: '.news-author, .article__author',
      body: '.js-mediator-article',
      summary: '.news-wrapper__content-lead',
      tags: '.news-tags a, .article-topics a',
      image: 'meta[property="og:image"]',
    },
    requestDelay: 1000,
  },
  {
    id: 'mperspektiva',
    name: 'Московская перспектива',
    baseUrl: 'https://mperspektiva.ru',
    method: 'sitemap',
    sitemapUrl: 'https://mperspektiva.ru/sitemap.xml',
    selectors: {
      title: 'h1, .c-news-content__title',
      date: 'meta[property="article:published_time"]',
      body: '.c-article-body, .nws_ct',
      tags: 'a[href^="/tags/"]',
      image: 'meta[property="og:image"]',
    },
    requestDelay: 1000,
  },

  // ============================
  // Пагинация (без sitemap/RSS)
  // ============================
  {
    id: 'minstroyrf',
    name: 'Минстрой РФ',
    baseUrl: 'https://www.minstroyrf.gov.ru',
    method: 'pagination',
    listUrl: 'https://www.minstroyrf.gov.ru/press/?d=all',
    pageParam: 'PAGEN_1',
    selectors: {
      articleLink: 'div.item-new div.new-text a',
      title: 'h1.h1-title',
      date: 'div.elm-date',
      body: 'div.article-detail-text',
      summary: 'div.article-preview-text',
      tags: 'div.new-tags a.elm-tag',
      image: 'meta[property="og:image"]',
    },
    requestDelay: 1500,
  },
  {
    id: 'ancb',
    name: 'АНСБ — Агентство новостей строительный бизнес',
    baseUrl: 'https://ancb.ru',
    method: 'pagination',
    listUrl: 'https://ancb.ru/news',
    pageParam: 'page',
    selectors: {
      articleLink: 'a[href^="/news/read/"]',
      title: 'h1',
      date: 'time, .date',
      body: '.news-text, article, .content',
    },
    requestDelay: 1500,
  },

  // ============================
  // Googlebot User-Agent (SSR)
  // ============================
  {
    id: 'mos_stroinadzor',
      name: 'Мосгосстройнадзор',
      baseUrl: 'https://www.mos.ru/stroinadzor',
      method: 'googlebot',
      listUrl: 'https://www.mos.ru/stroinadzor/news/',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      selectors: {
        title: 'meta[property="og:title"]',
        date: 'meta[property="article:published_time"]',
        body: 'article, .article-body, .news-detail',
        summary: 'meta[property="og:description"]',
        image: 'meta[property="og:image"]',
      },
      requestDelay: 2000,
    },

    // ============================
    // IT/ЦОД источники (RSS)
    // ============================
    {
      id: 'cnews',
      name: 'CNews — ИТ-новости',
      baseUrl: 'https://www.cnews.ru',
      method: 'rss',
      rssUrl: 'https://www.cnews.ru/inc/rss/news.xml',
      requestDelay: 500,
    },
    {
      id: 'servernews',
      name: 'ServerNews — ИТ-инфраструктура',
      baseUrl: 'https://servernews.ru',
      method: 'rss',
      rssUrl: 'https://servernews.ru/rss',
      requestDelay: 500,
    },
    {
      id: 'comnews',
      name: 'ComNews — Телеком и ИТ',
      baseUrl: 'https://www.comnews.ru',
      method: 'rss',
      rssUrl: 'https://www.comnews.ru/rss',
      requestDelay: 500,
    },
    {
      id: '3dnews',
      name: '3DNews — Hardware и IT',
      baseUrl: 'https://3dnews.ru',
      method: 'rss',
      rssUrl: 'https://3dnews.ru/news/rss',
      requestDelay: 500,
    },
    {
      id: 'ixbt',
      name: 'iXBT — IT и серверы',
      baseUrl: 'https://www.ixbt.com',
      method: 'rss',
      rssUrl: 'https://www.ixbt.com/export/news.rss',
      requestDelay: 500,
    },
    {
      id: 'spbit',
      name: 'SPBIT — ИТ-бизнес и ЦОД',
      baseUrl: 'https://spbit.ru',
      method: 'rss',
      rssUrl: 'https://spbit.ru/rss/',
      requestDelay: 500,
    },
    {
      id: 'itworld',
      name: 'IT World — ИТ-новости',
      baseUrl: 'https://www.it-world.ru',
      method: 'rss',
      rssUrl: 'https://www.it-world.ru/rss/',
      requestDelay: 500,
    },
    {
      id: 'dtf',
      name: 'DTF — ИТ и технологии',
      baseUrl: 'https://dtf.ru',
      method: 'rss',
      rssUrl: 'https://dtf.ru/rss/all',
      requestDelay: 500,
    },
  ];

/** ID источников, отключённых через env SOURCES_DISABLED */
export function getDisabledSourceIds(): string[] {
  return (process.env.SOURCES_DISABLED || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Активные источники (все, кроме отключённых через SOURCES_DISABLED) */
export const SOURCES: SourceConfig[] = (() => {
  const disabled = getDisabledSourceIds();
  if (disabled.length === 0) return ALL_SOURCES;
  return ALL_SOURCES.filter(s => !disabled.includes(s.id));
})();
