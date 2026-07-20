// ============================================================
// Абстрактный базовый класс для всех scraper'ов
// ============================================================

import { Article, ScrapeError, SourceConfig } from '../types.js';
import { makeArticleId } from '../utils.js';

export abstract class BaseScraper {
  protected config: SourceConfig;
  protected errors: ScrapeError[] = [];

  constructor(config: SourceConfig) {
    this.config = config;
  }

  /** Уникальный ключ источника */
  get sourceId(): string {
    return this.config.id;
  }

  /** Основной метод: найти и спарсить статьи за последние N дней */
  abstract scrape(daysBack: number): Promise<Article[]>;

  /** Добавить ошибку в лог */
  protected logError(message: string, url?: string): void {
    this.errors.push({
      source: this.config.id,
      url,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /** Получить ошибки */
  getErrors(): ScrapeError[] {
    return this.errors;
  }

  /** Создать Article с заполненными служебными полями */
  protected makeArticle(partial: Omit<Article, 'id' | 'source' | 'sourceName' | 'fetchedAt'>): Article {
    return {
      ...partial,
      id: makeArticleId(this.config.id, partial.url),
      source: this.config.id,
      sourceName: this.config.name,
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Задержка между запросами (из конфига) */
  protected async delay(): Promise<void> {
    const ms = this.config.requestDelay || 1000;
    await new Promise(r => setTimeout(r, ms));
  }

  /** Проверка: статья в пределах daysBack дней от сегодня */
  protected isWithinDays(dateStr: string, daysBack: number): boolean {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return true; // не можем определить — включаем
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    return date >= cutoff;
  }
}
