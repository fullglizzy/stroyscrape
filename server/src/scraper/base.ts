// ============================================================
// Абстрактный базовый класс для всех scraper'ов
// ============================================================

import { Article, ScrapeError, SourceConfig } from '../types.js';
import { makeArticleId } from '../utils.js';

export abstract class BaseScraper {
  protected config: SourceConfig;
  protected errors: ScrapeError[] = [];
  protected signal: AbortSignal | undefined;

  constructor(config: SourceConfig) {
    this.config = config;
  }

  /** Установить сигнал для остановки парсинга */
  setSignal(signal: AbortSignal): void {
    this.signal = signal;
  }

  /** Уникальный ключ источника */
  get sourceId(): string {
    return this.config.id;
  }

  /** Основной метод: найти и спарсить статьи за последние N дней */
  abstract scrape(daysBack: number): Promise<Article[]>;

  /** fetch с автоматическим AbortSignal и User-Agent */
  protected async fetch(url: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(init?.headers as Record<string, string> || {}),
    };

    // Добавляем сигнал остановки
    const signal = this.signal || init?.signal;

    return fetch(url, { ...init, headers, signal });
  }

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
    if (isNaN(date.getTime())) return true;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    return date >= cutoff;
  }
}
