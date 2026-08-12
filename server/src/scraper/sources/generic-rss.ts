// ============================================================
// Generic RSS scraper — подходит для любых RSS 2.0 фидов
// Поддерживает yandex:full-text для полного текста
// Fallback: если RSS даёт только сниппет — загружает страницу статьи
// ============================================================

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  description: string;
  'yandex:full-text'?: string;
  'content:encoded'?: string;
  enclosure?: { url: string };
};

const parser = new Parser<Record<string, unknown>, RssItem>({
  customFields: { item: ['yandex:full-text', 'content:encoded'] },
});

/** Минимальная длина текста из RSS, при которой НЕ идём на страницу */
const MIN_RSS_BODY_LENGTH = 300;

/** Универсальные селекторы для поиска тела статьи на странице */
const BODY_SELECTORS = [
  'article',
  '[class*="article"]',
  '[class*="post"]',
  '[class*="content"]',
  '[class*="news"]',
  '[class*="text"]',
  '[class*="body"]',
  '[class*="entry"]',
  '[class*="detail"]',
  '[itemprop="articleBody"]',
  '.js-mediator-article',
  '.post-view-body',
  '#content',
  'main',
];

export class GenericRssScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];
    try {
      const feed = await parser.parseURL(this.config.rssUrl!);
      for (const item of feed.items) {
        if (!item.link || !item.title) continue;

        const dateStr = item.pubDate ? parseRussianDate(item.pubDate) : new Date().toISOString();
        if (!this.isWithinDays(dateStr, daysBack)) continue;

        // Полный текст: yandex:full-text > content:encoded > content > description
        const rawHtml = item['yandex:full-text'] || item['content:encoded'] || item.content || item.description || '';
        let bodyText = cleanHtml(rawHtml);
        const summary = item.contentSnippet?.slice(0, 300)?.trim() || null;

        // Если RSS дал только короткий сниппет — идём на страницу за полным текстом
        if (bodyText.length < MIN_RSS_BODY_LENGTH) {
          try {
            const pageBody = await this.fetchArticleBody(item.link);
            if (pageBody && pageBody.length > bodyText.length) {
              bodyText = pageBody;
            }
          } catch {
            // Оставляем RSS-версию
          }
        }

        if (!bodyText || bodyText.length < 50) continue;

        articles.push(this.makeArticle({
          url: item.link,
          title: item.title.trim(),
          publishedAt: dateStr,
          author: null,
          bodyText,
          summary,
          imageUrl: item.enclosure?.url || null,
          tags: [],
        }));
      }
    } catch (err: any) {
      this.logError(`RSS parse error: ${err.message}`);
    }
    return articles;
  }

  /** Загрузить страницу статьи и извлечь тело */
  private async fetchArticleBody(url: string): Promise<string | null> {
    await this.delay();
    const res = await this.fetch(url);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Удаляем служебные блоки
    $('script, style, nav, footer, header, aside, noscript, iframe, .sidebar, .comments, .related, .recommend, .ad, .advertisement').remove();

    // Пробуем селекторы по порядку — берём самый длинный результат
    let best = '';
    for (const sel of BODY_SELECTORS) {
      const el = $(sel).first();
      if (el.length > 0) {
        const text = cleanHtml(el.html() || '');
        if (text.length > best.length) best = text;
      }
    }

    // Если ничего не нашли — берём body целиком
    if (!best || best.length < 50) {
      best = cleanHtml($('body').html() || '');
    }

    return best || null;
  }
}
