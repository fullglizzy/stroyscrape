import { Article } from '../api';
import { FileText } from 'lucide-react';
import ArticleCard from './ArticleCard';
import { CardSkeleton, EmptyState } from './ui';

interface Props {
  articles: Article[];
  loading: boolean;
}

export default function ArticleList({ articles, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3,4,5].map(i => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-12 h-12" />}
        title="Нет статей"
        description="Запустите парсинг, чтобы собрать новости строительной отрасли. Выберите источник и нажмите «Запустить»."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        Найдено: {articles.length}
      </div>
      {articles.map((article, i) => (
        <div key={article.id} className="animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
          <ArticleCard article={article} />
        </div>
      ))}
    </div>
  );
}
