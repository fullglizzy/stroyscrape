// ============================================================
// irn.ru — Sitemap → HTML (h1.post-view-header, time, div.post-view-body)
// ============================================================

import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

export class IrnScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];

    try {
      // 1. Получить sitemap
      const sitemapRes = await fetch(this.config.sitemapUrl!);
      const sitemapXml = await sitemapRes.text();

      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(sitemapXml);

      const urls: { loc: string; lastmod: string }[] =
        parsed?.urlset?.url?.map((u: any) => ({
          loc: u.loc,
          lastmod: u.lastmod || '',
        })) || [];

      // 2. Фильтровать по дате и /news/
      const newsUrls = urls.filter(
        u => u.loc.includes('/news/') && this.isWithinDays(parseRussianDate(u.lastmod), daysBack)
      );

      // 3. Спарсить каждую статью
      for (const { loc } of newsUrls) {
        try {
          await this.delay();
          const article = await this.fetchArticle(loc);
          if (article) articles.push(article);
        } catch (err: any) {
          this.logError(err.message, loc);
        }
      }
    } catch (err: any) {
      this.logError(`Sitemap error: ${err.message}`);
    }

    return articles;
  }

  private async fetchArticle(url: string): Promise<Article | null> {
    const res = await fetch(url);
    if (!res.ok) {
      this.logError(`HTTP ${res.status}`, url);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $(this.config.selectors?.title || 'h1').first().text().trim();
    if (!title) return null;

    const dateEl = $(this.config.selectors?.date || 'time[datetime]').first();
    const dateStr = dateEl.attr('datetime') || dateEl.text().trim();

    const bodyHtml = $(this.config.selectors?.body || '.post-view-body').html() || '';
    const bodyText = cleanHtml(bodyHtml);

    const imageUrl =
      $(this.config.selectors?.image || 'meta[property="og:image"]').attr('content') || null;

    return this.makeArticle({
      url,
      title,
      publishedAt: parseRussianDate(dateStr),
      author: null,
      bodyText,
      summary: null,
      imageUrl,
      tags: [],
    });
  }
}
