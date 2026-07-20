// ============================================================
// ancb.ru — HTML-пагинация (/news/page/N)
// Структура: <a class="one_text_section" href="/news/read/{id}">
//              <div>
//                <div class="date_section">DD.MM.YYYY</div>
//                <div class="title_section">Заголовок</div>
//                <div>Анонс</div>
//              </div>
//            </a>
// ============================================================

import * as cheerio from 'cheerio';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

export class AncbScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];
    const seen = new Set<string>();
    let page = 1;
    let stop = false;

    try {
      while (!stop && page <= 50) {
        const url = page === 1
          ? this.config.listUrl!
          : `${this.config.listUrl!}/page/${page}`;

        await this.delay();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        let res: Response;
        try {
          res = await this.fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          });
        } catch {
          clearTimeout(timeout);
          this.logError('Request timeout or failed', url);
          break;
        }
        clearTimeout(timeout);

        if (!res.ok) {
          this.logError(`HTTP ${res.status}`, url);
          break;
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        // Находим все ссылки на статьи. Структура: a.one_text_section[href^="/news/read/"]
        const links = $('a.one_text_section[href^="/news/read/"]');

        if (links.length === 0) {
          stop = true;
          break;
        }

        let pageHasRecentArticles = false;

        for (const el of links) {
          const href = $(el).attr('href');
          if (!href || href === '/news/read/') continue;

          const articleUrl = `${this.config.baseUrl}${href}`;
          if (seen.has(articleUrl)) continue;
          seen.add(articleUrl);

          // Дата внутри .date_section внутри <a> тега
          const dateText = $(el).find('.date_section').text().trim();
          const dateStr = dateText ? parseRussianDate(dateText) : new Date().toISOString();

          if (!this.isWithinDays(dateStr, daysBack)) {
            // Если на первой странице встретили старую статью — стоп
            if (page === 1 && !pageHasRecentArticles) {
              stop = true;
            }
            break;
          }

          pageHasRecentArticles = true;

          // Спарсить полную статью
          try {
            await this.delay();
            const article = await this.fetchArticle(articleUrl, $, el);
            if (article) articles.push(article);
          } catch (err: any) {
            this.logError(err.message, articleUrl);
          }
        }

        if (!pageHasRecentArticles) {
          stop = true;
        }

        page++;
      }
    } catch (err: any) {
      this.logError(`Pagination error: ${err.message}`);
    }

    return articles;
  }

  private async fetchArticle(url: string, $listing: cheerio.CheerioAPI, listingEl: any): Promise<Article | null> {
    // Сначала берём данные из listing (быстро)
    const listingTitle = $listing(listingEl).find('.title_section').text().trim();
    const listingDate = $listing(listingEl).find('.date_section').text().trim();
    const listingExcerpt = $listing(listingEl).find('div').last().text().trim();

    // Фетчим полную страницу
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let res: Response;
    try {
      res = await this.fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
    } catch {
      clearTimeout(timeout);
      // Если не можем загрузить полную статью, используем данные из listing
      if (listingTitle) {
        return this.makeArticle({
          url,
          title: listingTitle,
          publishedAt: parseRussianDate(listingDate),
          author: null,
          bodyText: listingExcerpt || '',
          summary: listingExcerpt || null,
          imageUrl: null,
          tags: [],
        });
      }
      return null;
    }
    clearTimeout(timeout);

    if (!res.ok) {
      // Fallback на listing
      if (listingTitle) {
        return this.makeArticle({
          url,
          title: listingTitle,
          publishedAt: parseRussianDate(listingDate),
          author: null,
          bodyText: listingExcerpt || '',
          summary: listingExcerpt || null,
          imageUrl: null,
          tags: [],
        });
      }
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $('h1').first().text().trim() || listingTitle;
    if (!title) return null;

    // Дата из статьи
    const dateText = $('.date_section').first().text().trim() || listingDate;

    // Тело статьи: ищем контент внутри #content или article
    const bodyHtml = $('#content, article, .news-text').html() || '';
    const bodyText = cleanHtml(bodyHtml);

    return this.makeArticle({
      url,
      title,
      publishedAt: parseRussianDate(dateText),
      author: null,
      bodyText: bodyText || listingExcerpt || '',
      summary: listingExcerpt || null,
      imageUrl: null,
      tags: [],
    });
  }
}
