import { useState, useEffect, useCallback, useRef } from 'react';
import { Article } from '../api';
import { FileText, Search, ArrowUpDown, ChevronDown, Loader2 } from 'lucide-react';
import ArticleCard from './ArticleCard';
import { CardSkeleton, EmptyState } from './ui';

interface Props {
  selectedSources: Set<string>;
}

type SortKey = 'date' | 'source' | 'title';
const DATE_OPTIONS = [
  { label: 'Всё время', days: 0 },
  { label: '24 часа', days: 1 },
  { label: '3 дня', days: 3 },
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
];

const PAGE_SIZE = 50;

export default function ArticleList({ selectedSources }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [dateFilter, setDateFilter] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // Оффсет храним в ref, а не читаем из state — иначе useCallback
  // запоминает articles первого рендера ([]), и offset всегда 0
  const offsetRef = useRef(0);

  const fetchArticles = useCallback(async (reset: boolean) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (reset) { setLoading(true); offsetRef.current = 0; }
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (!reset) params.set('offset', String(offsetRef.current));
      if (dateFilter > 0) params.set('days', String(dateFilter));
      if (selectedSources.size > 0) params.set('source', Array.from(selectedSources).join(','));

      // Для поиска грузим больше и фильтруем на клиенте
      const limit = search ? Math.max(PAGE_SIZE * 5, 200) : PAGE_SIZE;
      params.set('limit', String(limit));

      const res = await fetch(`/api/articles?${params}`, { signal: ctrl.signal });
      const data = await res.json();

      if (reset) {
        setArticles(data.articles);
        offsetRef.current = data.articles.length;
      } else {
        // Страховка от дублей при дозагрузке: не добавляем уже загруженные id
        setArticles(prev => {
          const seen = new Set(prev.map(a => a.id));
          return [...prev, ...data.articles.filter((a: Article) => !seen.has(a.id))];
        });
        offsetRef.current += data.articles.length;
      }
      setTotal(data.total);
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [dateFilter, selectedSources, search]);

  // Initial load + reload on filter change
  useEffect(() => {
    fetchArticles(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchArticles]);

  // Client-side sort + search
  const filtered = (() => {
    let result = [...articles];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.bodyText.toLowerCase().includes(q) ||
        a.sourceName.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'title': return a.title.localeCompare(b.title, 'ru');
        case 'source': return a.sourceName.localeCompare(b.sourceName, 'ru');
        default: return b.publishedAt.localeCompare(a.publishedAt);
      }
    });

    return result;
  })();

  const hasMore = articles.length < total && !search;
  const showLoadMore = articles.length < total && !search;

  if (loading && articles.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => <CardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по статьям..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>

        <div className="relative">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm cursor-pointer"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            <option value="date">По дате</option>
            <option value="source">По источнику</option>
            <option value="title">По заголовку</option>
          </select>
          <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
        </div>

        <div className="flex gap-1">
          {DATE_OPTIONS.map(d => (
            <button key={d.days}
              onClick={() => setDateFilter(d.days)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={dateFilter === d.days
                ? { background: 'var(--color-primary)', color: 'white' }
                : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {search
          ? `Найдено: ${filtered.length}`
          : `Загружено: ${articles.length} из ${total}`}
      </div>

      {/* Empty */}
      {filtered.length === 0 && !loading && (
        articles.length === 0
          ? <EmptyState icon={<FileText className="w-12 h-12" />} title="Нет статей" description="Запустите парсинг, чтобы собрать новости." />
          : <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Ничего не найдено по запросу «{search}»</div>
      )}

      {/* Cards */}
      {filtered.map((article, i) => (
        <div key={article.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}>
          <ArticleCard article={article} />
        </div>
      ))}

      {/* Load more from server */}
      {showLoadMore && (
        <button onClick={() => fetchArticles(false)} disabled={loadingMore}
          className="w-full py-3 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          style={{ color: 'var(--color-primary)', background: 'var(--color-primary-bg)' }}>
          {loadingMore
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</>
            : <>{hasMore ? `Загрузить ещё (${total - articles.length})` : `Все ${total} статей загружено`}<ChevronDown className="w-4 h-4" /></>}
        </button>
      )}
    </div>
  );
}
