// ============================================================
// Generic RSS scraper — подходит для любых RSS 2.0 фидов
// Поддерживает yandex:full-text для полного текста
// ============================================================

import Parser from 'rss-parser';
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
        const bodyText = cleanHtml(rawHtml);
        const summary = item.contentSnippet?.slice(0, 300)?.trim() || null;

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
}
