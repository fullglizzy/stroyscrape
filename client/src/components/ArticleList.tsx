import { Article } from '../api';
import { Loader2, FileText } from 'lucide-react';
import ArticleCard from './ArticleCard';

interface Props {
  articles: Article[];
  loading: boolean;
}

export default function ArticleList({ articles, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-500">Загрузка статей...</span>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-500">Нет статей</h3>
        <p className="text-sm text-gray-400 mt-1">
          Запустите парсинг, чтобы собрать новости строительной отрасли
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-500">
          Найдено статей: {articles.length}
        </h2>
      </div>
      {articles.map(article => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}
