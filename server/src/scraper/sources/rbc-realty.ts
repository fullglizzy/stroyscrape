// ============================================================
// realty.rbc.ru — RSS (полный текст + rbc_news метаданные)
// ============================================================

import Parser from 'rss-parser';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

type RbcItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  'rbc_news:full-text'?: string;
  'rbc_news:anons'?: string;
  enclosure?: { url: string };
};

const parser = new Parser<Record<string, unknown>, RbcItem>({
  customFields: { item: ['rbc_news:full-text', 'rbc_news:anons'] },
});

export class RbcRealtyScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];
    try {
      const feed = await parser.parseURL(this.config.rssUrl!);
      for (const item of feed.items) {
        if (!item.link || !item.title) continue;

        const dateStr = item.pubDate ? parseRussianDate(item.pubDate) : new Date().toISOString();
        if (!this.isWithinDays(dateStr, daysBack)) continue;

        const rawHtml = item['rbc_news:full-text'] || item.content || '';
        const bodyText = cleanHtml(rawHtml);
        const summary = item['rbc_news:anons'] || item.contentSnippet || null;

        articles.push(this.makeArticle({
          url: item.link,
          title: item.title.trim(),
          publishedAt: dateStr,
          author: null,
          bodyText,
          summary: summary?.trim() || null,
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
