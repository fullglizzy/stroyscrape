// ============================================================
// stroygaz.ru — RSS (полный текст в yandex:full-text)
// ============================================================

import Parser from 'rss-parser';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

type StroygazItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  'yandex:full-text': string;
  enclosure?: { url: string };
};

const parser = new Parser<Record<string, unknown>, StroygazItem>({
  customFields: { item: ['yandex:full-text'] },
});

export class StroygazScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];
    try {
      const feed = await parser.parseURL(this.config.rssUrl!);
      for (const item of feed.items) {
        if (!item.link || !item.title) continue;

        const dateStr = item.pubDate ? parseRussianDate(item.pubDate) : new Date().toISOString();
        if (!this.isWithinDays(dateStr, daysBack)) continue;

        // Полный текст из yandex:full-text или fallback на content
        const rawHtml = item['yandex:full-text'] || item.content || '';
        const bodyText = cleanHtml(rawHtml);

        articles.push(this.makeArticle({
          url: item.link,
          title: item.title.trim(),
          publishedAt: dateStr,
          author: null,
          bodyText,
          summary: item.contentSnippet?.trim() || null,
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
