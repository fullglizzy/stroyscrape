// ============================================================
// mperspektiva.ru — Sitemap (Bitrix iblock-1.xml) → HTML
// ВАЖНО: www-поддомен имеет невалидный SSL → заменяем на без www
// ============================================================

import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { Article } from '../../types.js';
import { BaseScraper } from '../base.js';
import { cleanHtml, parseRussianDate } from '../../utils.js';

export class MperspektivaScraper extends BaseScraper {
  async scrape(daysBack: number): Promise<Article[]> {
    const articles: Article[] = [];

    try {
      // 1. Sitemap index → найти iblock-1
      const idxRes = await this.fetch(this.config.sitemapUrl!);
      const idxXml = await idxRes.text();

      const parser = new XMLParser({ ignoreAttributes: false });
      const idxParsed = parser.parse(idxXml);

      const sitemaps: string[] =
        idxParsed?.sitemapindex?.sitemap?.map((s: any) => s.loc) || [];

      // Ищем sitemap с iblock-1 (новости). Заменяем www на без-www (SSL fix)
      const newsSitemaps = sitemaps
        .filter((s: string) => s.includes('iblock-1'))
        .map((s: string) => s.replace('www.mperspektiva.ru', 'mperspektiva.ru'));

      if (newsSitemaps.length === 0) {
        this.logError('iblock-1 sitemap not found');
        return articles;
      }

      console.log(`[mperspektiva] Найдено ${newsSitemaps.length} sitemap(ов) с новостями`);

      // 2. Загрузить каждый news sitemap и собрать URL'ы
      const allLoc = new Set<string>();
      const urlEntries: { loc: string; lastmod: string }[] = [];

      for (const smUrl of newsSitemaps) {
        try {
          console.log(`[mperspektiva] Загрузка sitemap: ${smUrl}`);
          const smRes = await this.fetch(smUrl);
          if (!smRes.ok) {
            this.logError(`Sitemap HTTP ${smRes.status}`, smUrl);
            continue;
          }
          const smXml = await smRes.text();
          const smParsed = parser.parse(smXml);

          const urls: { loc: string; lastmod: string }[] =
            smParsed?.urlset?.url?.map((u: any) => ({
              loc: u.loc.replace('www.mperspektiva.ru', 'mperspektiva.ru'),
              lastmod: u.lastmod || '',
            })) || [];

          for (const u of urls) {
            if (!allLoc.has(u.loc)) {
              allLoc.add(u.loc);
              urlEntries.push(u);
            }
          }
          console.log(`[mperspektiva] +${urls.length} URL из sitemap`);
        } catch (err: any) {
          this.logError(`Sitemap error: ${err.message}`, smUrl);
        }
      }

      // 3. Фильтровать /topics/ и дату
      const filtered = urlEntries.filter(
        u => u.loc.includes('/topics/') && this.isWithinDays(parseRussianDate(u.lastmod), daysBack)
      );

      console.log(`[mperspektiva] После фильтрации по дате: ${filtered.length} статей`);

      // 4. Спарсить каждую
      for (const { loc } of filtered) {
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
      return null;
    }
    clearTimeout(timeout);

    if (!res.ok) {
      this.logError(`HTTP ${res.status}`, url);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $(this.config.selectors?.title || 'h1').first().text().trim();
    if (!title) return null;

    const dateStr = $(this.config.selectors?.date || 'time').first().text().trim();
    const bodyHtml = $(this.config.selectors?.body || '.article-content, .content, article').html() || '';
    const bodyText = cleanHtml(bodyHtml);

    const tags = $(this.config.selectors?.tags || 'a[href^="/tags/"]')
      .map((_, el) => $(el).text().trim().replace(/^#/, ''))
      .get()
      .filter(Boolean);

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
      tags,
    });
  }
}
