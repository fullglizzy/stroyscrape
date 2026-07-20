// ============================================================
// Общие типы для парсера строительных новостей
// ============================================================

/** Единая модель статьи после парсинга */
export interface Article {
  id: string;
  source: string;
  sourceName: string;
  url: string;
  title: string;
  publishedAt: string;   // ISO 8601
  author: string | null;
  bodyText: string;
  summary: string | null;
  imageUrl: string | null;
  tags: string[];
  fetchedAt: string;     // ISO 8601 — когда спарсили
}

/** Конфигурация одного источника */
export interface SourceConfig {
  id: string;                // Уникальный ключ: "stroygaz", "rbc_realty"
  name: string;              // Человеческое имя: "Строительная газета"
  baseUrl: string;           // Базовый URL сайта
  method: 'rss' | 'sitemap' | 'pagination' | 'googlebot';
  // RSS-specific
  rssUrl?: string;
  // Sitemap-specific
  sitemapUrl?: string;
  // Pagination-specific
  listUrl?: string;
  pageParam?: string;
  // Селекторы (для HTML-парсинга)
  selectors?: {
    articleLink?: string;
    title?: string;
    date?: string;
    author?: string;
    body?: string;
    summary?: string;
    image?: string;
    tags?: string;
  };
  // Дополнительные заголовки
  headers?: Record<string, string>;
  // Cookie
  cookie?: string;
  // Задержка между запросами (мс)
  requestDelay?: number;
}

/** Статус процесса парсинга */
export interface ScrapeStatus {
  running: boolean;
  startedAt: string | null;
  progress: {
    totalSources: number;
    doneSources: number;
    totalArticles: number;
    currentSource: string;
    currentStep: string;
  };
  lastRun: string | null;
  errors: ScrapeError[];
}

export interface ScrapeError {
  source: string;
  url?: string;
  message: string;
  timestamp: string;
}

/** Результат одного scraper'а */
export interface ScraperResult {
  source: string;
  articles: Article[];
  errors: ScrapeError[];
}
