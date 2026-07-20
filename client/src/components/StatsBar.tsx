import { Article, SourceStats } from '../api';
import { Newspaper, Calendar, Database, Clock } from 'lucide-react';
import { StatsSkeleton } from './ui';

interface Props {
  articles: Article[];
  sources: SourceStats;
  loading?: boolean;
}

export default function StatsBar({ articles, sources, loading }: Props) {
  if (loading) return <StatsSkeleton />;

  const sourceCount = Object.keys(sources).length;
  const activeSources = Object.values(sources).filter(s => s.count > 0).length;
  const latestArticle = articles.length > 0
    ? articles.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b))
    : null;
  const latestDate = latestArticle
    ? new Date(latestArticle.publishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : '—';

  const stats = [
    { icon: <Newspaper className="w-5 h-5" />, label: 'Всего статей', value: String(articles.length), color: 'var(--color-primary)' },
    { icon: <Database className="w-5 h-5" />, label: 'Источников', value: `${activeSources}/${sourceCount}`, color: 'var(--color-success)' },
    { icon: <Calendar className="w-5 h-5" />, label: 'Свежая', value: latestDate, color: 'var(--color-warning)' },
    { icon: <Clock className="w-5 h-5" />, label: 'В работе', value: activeSources > 0 ? 'Активен' : '—', color: 'var(--color-purple)' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {stats.map((s, i) => (
        <div key={i} className="card p-3 md:p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: s.color + '18', color: s.color }}>
            {s.icon}
          </div>
          <div className="min-w-0">
            <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{s.label}</div>
            <div className="text-lg md:text-xl font-bold truncate" style={{ color: 'var(--color-text)' }}>{s.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
