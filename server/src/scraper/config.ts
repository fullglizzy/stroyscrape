// ============================================================
// Базовая конфигурация всех 9 источников
// ============================================================

import { SourceConfig } from '../types.js';

export const SOURCES: SourceConfig[] = [
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
      body: '.news-content, .article-body',
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
      title: 'h1',
      date: 'time',
      body: '.article-content, .content, article',
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
      date: 'time, .date, span:contains(".")',
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
];
