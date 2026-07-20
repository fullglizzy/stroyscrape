// ============================================================
// stroi.mos.ru — Sitemap index → sitemap.post.xml.gz → HTML
// ============================================================

import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

export class StroiMosScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];

    try {
      // 1. Sitemap index → найти post sitemap
      const idxRes = await this.fetch(this.config.sitemapUrl!);
      const idxXml = await idxRes.text();

      const parser = new XMLParser({ ignoreAttributes: false });
      const idxParsed = parser.parse(idxXml);

      const sitemaps: string[] =
        idxParsed?.sitemapindex?.sitemap?.map((s: any) => s.loc) || [];

      const postSitemap = sitemaps.find((s: string) => s.includes('post'));

      if (!postSitemap) {
        this.logError('Post sitemap not found in index');
        return articles;
      }

      // 2. Загрузить post sitemap (возможно gzip)
      const postRes = await this.fetch(postSitemap);
      let postXml: string;

      if (postSitemap.endsWith('.gz')) {
        // В Node.js нет встроенной gunzip для fetch — используем buffer
        const buf = await postRes.arrayBuffer();
        const { gunzipSync } = await import('node:zlib');
        postXml = gunzipSync(Buffer.from(buf)).toString('utf-8');
      } else {
        postXml = await postRes.text();
      }

      const postParsed = parser.parse(postXml);
      const urls: { loc: string; lastmod: string }[] =
        postParsed?.urlset?.url?.map((u: any) => ({
          loc: u.loc,
          lastmod: u.lastmod || '',
        })) || [];

      // 3. Фильтровать /news/ и дату
      const newsUrls = urls.filter(
        u => u.loc.includes('/news/') && this.isWithinDays(parseRussianDate(u.lastmod), daysBack)
      );

      // 4. Спарсить каждую
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
    const res = await this.fetch(url);
    if (!res.ok) {
      this.logError(`HTTP ${res.status}`, url);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $(this.config.selectors?.title || 'h1').first().text().trim();
    if (!title) return null;

    const dateStr = $(this.config.selectors?.date || 'time').first().text().trim();
    const author = $(this.config.selectors?.author || '.news-author').first().text().trim() || null;

    const bodyHtml = $(this.config.selectors?.body || '.js-mediator-article').html() || '';
    const bodyText = cleanHtml(bodyHtml);

    // Пробуем извлечь лид из .news-wrapper__content-lead
    const summaryRaw = $(this.config.selectors?.summary || '.news-wrapper__content-lead').first().text().trim();
    const summary = summaryRaw || null;

    const tags = $(this.config.selectors?.tags || '.news-tags a, .article-topics a')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

    const imageUrl =
      $(this.config.selectors?.image || 'meta[property="og:image"]').attr('content') || null;

    return this.makeArticle({
      url,
      title,
      publishedAt: parseRussianDate(dateStr),
      author,
      bodyText,
      summary,
      imageUrl,
      tags,
    });
  }
}
