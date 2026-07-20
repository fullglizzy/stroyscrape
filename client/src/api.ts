// ============================================================
// API-клиент для взаимодействия с бэкендом
// ============================================================

export interface Article {
  id: string;
  source: string;
  sourceName: string;
  url: string;
  title: string;
  publishedAt: string;
  author: string | null;
  bodyText: string;
  summary: string | null;
  imageUrl: string | null;
  tags: string[];
  fetchedAt: string;
}

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
  errors: { source: string; url?: string; message: string; timestamp: string }[];
}

export interface ArticlesResponse {
  total: number;
  offset: number;
  limit: number;
  articles: Article[];
}

export interface SourceStats {
  [sourceId: string]: {
    name: string;
    count: number;
    lastArticle: string | null;
  };
}

const BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  /** Запустить парсинг (всех или одного источника) */
  startScrape: (source?: string) =>
    fetchJSON<{ ok: boolean; message: string; source: string | null }>('/scrape', {
      method: 'POST',
      body: JSON.stringify({ source: source || undefined }),
    }),

  /** Остановить парсинг */
  stopScrape: () =>
    fetchJSON<{ ok: boolean; message: string }>('/scrape/stop', { method: 'POST' }),

  /** Сбросить зависший статус */
  resetScrape: () =>
    fetchJSON<{ ok: boolean; message: string }>('/scrape/reset', { method: 'POST' }),

  /** Статус парсинга */
  getStatus: () => fetchJSON<ScrapeStatus>('/scrape/status'),

  /** Список статей */
  getArticles: (params?: { source?: string; days?: number; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.source) qs.set('source', params.source);
    if (params?.days) qs.set('days', String(params.days));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return fetchJSON<ArticlesResponse>(`/articles${query ? `?${query}` : ''}`);
  },

  /** Одна статья */
  getArticle: (id: string) => fetchJSON<Article>(`/articles/${encodeURIComponent(id)}`),

  /** Статистика по источникам */
  getSources: () => fetchJSON<SourceStats>('/sources'),
};
