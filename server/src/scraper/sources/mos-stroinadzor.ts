// ============================================================
// mos.ru/stroinadzor — Googlebot User-Agent для SSR → OG meta + HTML
// ============================================================

import * as cheerio from 'cheerio';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export class MosStroinadzorScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];
    const seen = new Set<string>();
    let page = 1;
    let stop = false;

    try {
      while (!stop && page <= 50) {
        // Используем search/newsfeed API для списка
        const listUrl = page === 1
          ? this.config.listUrl!
          : `https://www.mos.ru/search/newsfeed?page=${page}&q=&spheres=18299`;

        await this.delay();

        const res = await fetch(listUrl, {
          headers: {
            'User-Agent': GOOGLEBOT_UA,
          },
        });

        if (!res.ok) {
          this.logError(`HTTP ${res.status}`, listUrl);
          break;
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        // Ищем ссылки на /news/item/{id}/
        const links = $('a[href*="/news/item/"]');

        if (links.length === 0) {
          stop = true;
          break;
        }

        for (const el of links) {
          const href = $(el).attr('href');
          if (!href) continue;

          const articleUrl = href.startsWith('http')
            ? href
            : `https://www.mos.ru${href}`;

          if (seen.has(articleUrl)) continue;
          seen.add(articleUrl);

          try {
            await this.delay();
            const article = await this.fetchArticle(articleUrl);

            if (article && this.isWithinDays(article.publishedAt, daysBack)) {
              articles.push(article);
            } else if (article && !this.isWithinDays(article.publishedAt, daysBack)) {
              stop = true;
              break;
            }
          } catch (err: any) {
            this.logError(err.message, articleUrl);
          }
        }

        page++;
      }
    } catch (err: any) {
      this.logError(`Scrape error: ${err.message}`);
    }

    return articles;
  }

  private async fetchArticle(url: string): Promise<Article | null> {
    const res = await fetch(url, {
      headers: { 'User-Agent': GOOGLEBOT_UA },
    });

    if (!res.ok) {
      this.logError(`HTTP ${res.status}`, url);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // OG метатеги — самый надёжный источник
    const title =
      $(this.config.selectors?.title || 'meta[property="og:title"]').attr('content') ||
      $('title').text().split(' / ')[0].trim();

    if (!title) return null;

    const dateStr =
      $(this.config.selectors?.date || 'meta[property="article:published_time"]').attr('content') ||
      new Date().toISOString();

    const summary =
      $(this.config.selectors?.summary || 'meta[property="og:description"]').attr('content') || null;

    const imageUrl =
      $(this.config.selectors?.image || 'meta[property="og:image"]').attr('content') || null;

    // Тело статьи — из SSR HTML
    const bodyHtml = $('article, .article-body, .news-detail, [class*="content"]').html() || '';
    const bodyText = cleanHtml(bodyHtml);

    return this.makeArticle({
      url,
      title: title.trim(),
      publishedAt: parseRussianDate(dateStr),
      author: null,
      bodyText,
      summary: summary?.trim() || null,
      imageUrl,
      tags: [],
    });
  }
}
