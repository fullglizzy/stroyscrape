// ============================================================
// minstroyrf.gov.ru — HTML-пагинация (Bitrix: PAGEN_1)
// ============================================================

import * as cheerio from 'cheerio';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

export class MinstroyrfScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];
    const seen = new Set<string>();
    let page = 1;
    let stop = false;

    try {
      while (!stop && page <= 100) {
        const url = page === 1
          ? this.config.listUrl!
          : `${this.config.listUrl!}&${this.config.pageParam}=${page}`;

        await this.delay();

        const res = await this.fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });

        if (!res.ok) {
          this.logError(`HTTP ${res.status}`, url);
          break;
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        const links = $(this.config.selectors?.articleLink || 'div.item-new div.new-text a');

        if (links.length === 0) {
          stop = true;
          break;
        }

        for (const el of links) {
          const href = $(el).attr('href');
          if (!href) continue;

          const articleUrl = href.startsWith('http')
            ? href
            : `${this.config.baseUrl}${href}`;

          if (seen.has(articleUrl)) continue;
          seen.add(articleUrl);

          // Проверяем дату на listing-странице
          const itemBlock = $(el).closest('div.item-new');
          const listingDate = itemBlock.find('div.new-date').text().trim();
          const parsedListingDate = parseRussianDate(listingDate);

          if (!this.isWithinDays(parsedListingDate, daysBack)) {
            stop = true;
            break;
          }

          // Спарсить полную статью
          try {
            await this.delay();
            const article = await this.fetchArticle(articleUrl);

            // Теги из listing
            const listingTags = itemBlock.find('div.new-tags a.elm-tag')
              .map((_, t) => $(t).text().trim())
              .get();

            if (article) {
              article.tags = [...new Set([...article.tags, ...listingTags])];
              articles.push(article);
            }
          } catch (err: any) {
            this.logError(err.message, articleUrl);
          }
        }

        page++;
      }
    } catch (err: any) {
      this.logError(`Pagination error: ${err.message}`);
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

    const title = $(this.config.selectors?.title || 'h1.h1-title').first().text().trim();
    if (!title) return null;

    const dateStr = $(this.config.selectors?.date || 'div.elm-date').first().text().trim();
    const summary = $(this.config.selectors?.summary || 'div.article-preview-text').first().text().trim() || null;

    const bodyHtml = $(this.config.selectors?.body || 'div.article-detail-text').html() || '';
    const bodyText = cleanHtml(bodyHtml);

    const imageUrl =
      $(this.config.selectors?.image || 'meta[property="og:image"]').attr('content') || null;

    return this.makeArticle({
      url,
      title,
      publishedAt: parseRussianDate(dateStr),
      author: null,
      bodyText,
      summary,
      imageUrl,
      tags: [],
    });
  }
}
