// ============================================================
// rcmm.ru — RSS (/rss.xml) + cookie beget=begetok
// ============================================================

import Parser from 'rss-parser';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

type RcmmItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  categories?: string[];
  enclosure?: { url: string };
};

const parser = new Parser<Record<string, unknown>, RcmmItem>();

export class RcmmScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];
    try {
      // rss-parser не поддерживает кастомные заголовки напрямую,
      // поэтому делаем fetch с cookie и парсим тело
      const res = await this.fetch(this.config.rssUrl!, {
        headers: {
          Cookie: this.config.cookie || '',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!res.ok) {
        this.logError(`HTTP ${res.status} при запросе RSS`);
        return articles;
      }

      const xml = await res.text();
      const feed = await parser.parseString(xml);

      for (const item of feed.items) {
        if (!item.link || !item.title) continue;

        const dateStr = item.pubDate ? parseRussianDate(item.pubDate) : new Date().toISOString();
        if (!this.isWithinDays(dateStr, daysBack)) continue;

        const bodyText = cleanHtml(item.content || item.contentSnippet || '');
        const tags = item.categories || [];

        articles.push(this.makeArticle({
          url: item.link,
          title: item.title.trim(),
          publishedAt: dateStr,
          author: null,
          bodyText,
          summary: item.contentSnippet?.trim() || null,
          imageUrl: item.enclosure?.url || null,
          tags,
        }));
      }
    } catch (err: any) {
      this.logError(`RSS parse error: ${err.message}`);
    }
    return articles;
  }
}
