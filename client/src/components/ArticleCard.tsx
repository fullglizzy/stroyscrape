import { useState } from 'react';
import { Article } from '../api';
import { ExternalLink, Calendar, Tag, ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';

interface Props {
  article: Article;
}

export default function ArticleCard({ article }: Props) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(article.publishedAt).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Превью текста (первые 300 символов)
  const preview = article.bodyText.slice(0, 300).trim();
  const hasMore = article.bodyText.length > 300;

  return (
    <div className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        {/* Заголовок и источник */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-semibold text-gray-900 leading-snug flex-1">
            {article.title}
          </h3>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-gray-400 hover:text-blue-600 transition-colors mt-0.5"
            title="Открыть оригинал"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Мета-информация */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full font-medium text-gray-600">
            {article.sourceName}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {date}
          </span>
          {article.author && (
            <span className="text-gray-400">
              {article.author}
            </span>
          )}
        </div>

        {/* Изображение (если есть) */}
        {article.imageUrl && (
          <div className="mb-3 rounded-lg overflow-hidden bg-gray-100 max-h-48">
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Текст */}
        <p className={`text-sm text-gray-700 leading-relaxed ${!expanded && hasMore ? 'line-clamp-4' : ''}`}>
          {expanded ? article.bodyText : preview}
        </p>

        {/* Кнопка "показать ещё" */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Свернуть
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Читать полностью
              </>
            )}
          </button>
        )}

        {/* Теги */}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t">
            <Tag className="w-3 h-3 text-gray-400" />
            {article.tags.slice(0, 8).map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600"
              >
                {tag}
              </span>
            ))}
            {article.tags.length > 8 && (
              <span className="text-xs text-gray-400">
                +{article.tags.length - 8}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
