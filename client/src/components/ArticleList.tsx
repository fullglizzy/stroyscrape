import { useState, useMemo } from 'react';
import { Article } from '../api';
import { FileText, Search, ArrowUpDown, ChevronDown } from 'lucide-react';
import ArticleCard from './ArticleCard';
import { CardSkeleton, EmptyState } from './ui';

interface Props {
  articles: Article[];
  loading: boolean;
}

type SortKey = 'date' | 'source' | 'title';
const DATE_OPTIONS = [
  { label: 'Всё время', days: 0 },
  { label: '24 часа', days: 1 },
  { label: '3 дня', days: 3 },
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
];

const PAGE_SIZE = 20;

export default function ArticleList({ articles, loading }: Props) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [dateFilter, setDateFilter] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count when filters change
  const resetPagination = () => setVisibleCount(PAGE_SIZE);

  const filtered = useMemo(() => {
    let result = [...articles];

    // Date filter
    if (dateFilter > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dateFilter);
      result = result.filter(a => new Date(a.publishedAt) >= cutoff);
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.bodyText.toLowerCase().includes(q) ||
        a.sourceName.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title': return a.title.localeCompare(b.title, 'ru');
        case 'source': return a.sourceName.localeCompare(b.sourceName, 'ru');
        case 'date':
        default: return b.publishedAt.localeCompare(a.publishedAt);
      }
    });

    return result;
  }, [articles, search, sortBy, dateFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Loading state
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => <CardSkeleton key={i} />)}
      </div>
    );
  }

  // No articles at all
  if (articles.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-12 h-12" />}
        title="Нет статей"
        description="Запустите парсинг, чтобы собрать новости строительной отрасли."
      />
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Controls bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); resetPagination(); }}
            placeholder="Поиск по статьям..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value as SortKey); resetPagination(); }}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm cursor-pointer"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            <option value="date">По дате</option>
            <option value="source">По источнику</option>
            <option value="title">По заголовку</option>
          </select>
          <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
        </div>

        {/* Date filter */}
        <div className="flex gap-1">
          {DATE_OPTIONS.map(d => (
            <button key={d.days}
              onClick={() => { setDateFilter(d.days); resetPagination(); }}
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
        {filtered.length === articles.length
          ? `Всего: ${articles.length}`
          : `Найдено: ${filtered.length} из ${articles.length}`}
      </div>

      {/* Empty result */}
      {filtered.length === 0 && search && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Ничего не найдено по запросу «{search}»
        </div>
      )}

      {/* Article cards */}
      {visible.map((article, i) => (
        <div key={article.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}>
          <ArticleCard article={article} />
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
          className="w-full py-3 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          style={{ color: 'var(--color-primary)', background: 'var(--color-primary-bg)' }}>
          Загрузить ещё ({filtered.length - visibleCount})
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
