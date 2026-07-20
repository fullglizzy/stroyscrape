import { Article, SourceStats } from '../api';
import { Newspaper, Calendar, Database } from 'lucide-react';

interface Props {
  articles: Article[];
  sources: SourceStats;
}

export default function StatsBar({ articles, sources }: Props) {
  const sourceCount = Object.keys(sources).length;

  // Находим самую свежую статью
  const latestArticle = articles.length > 0
    ? articles.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b))
    : null;

  const latestDate = latestArticle
    ? new Date(latestArticle.publishedAt).toLocaleDateString('ru-RU')
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={<Newspaper className="w-5 h-5" />}
        label="Всего статей"
        value={String(articles.length)}
        color="blue"
      />
      <StatCard
        icon={<Database className="w-5 h-5" />}
        label="Источников"
        value={String(sourceCount)}
        color="green"
      />
      <StatCard
        icon={<Calendar className="w-5 h-5" />}
        label="Свежая статья"
        value={latestDate || '—'}
        color="amber"
      />
      <StatCard
        icon={<Calendar className="w-5 h-5" />}
        label="Активных источников"
        value={String(Object.values(sources).filter(s => s.count > 0).length)}
        color="purple"
      />
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}
