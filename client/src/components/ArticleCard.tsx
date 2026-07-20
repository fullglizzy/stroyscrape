import { useState } from 'react';
import { Article } from '../api';
import { ExternalLink, Calendar, Tag, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useToast } from '../ToastContext';

interface Props { article: Article; }

/** Статьи, появившиеся после этой метки времени, считаются новыми */
const VISIT_KEY = 'stroyscrape_last_visit';

export function markVisit() {
  localStorage.setItem(VISIT_KEY, new Date().toISOString());
}

export function isArticleNew(publishedAt: string): boolean {
  const lastVisit = localStorage.getItem(VISIT_KEY);
  if (!lastVisit) return false;
  return new Date(publishedAt) > new Date(lastVisit);
}

export default function ArticleCard({ article }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const date = new Date(article.publishedAt).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const preview = article.bodyText.slice(0, 300).trim();
  const hasMore = article.bodyText.length > 300;
  const isNew = isArticleNew(article.publishedAt);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(article.url).then(() => {
      setCopied(true);
      toast.success('Ссылка скопирована');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error('Не удалось скопировать');
    });
  };

  return (
    <div className="card p-4 md:p-5 transition-all relative">
      {/* New badge */}
      {isNew && (
        <div className="absolute -top-1.5 -right-1.5 px-2 py-0.5 rounded-full text-xs font-bold z-10"
          style={{ background: 'var(--color-success)', color: 'white' }}>
          NEW
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm md:text-base font-semibold leading-snug flex-1" style={{ color: 'var(--color-text)' }}>
          {article.title}
        </h3>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handleCopyLink}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}
            title="Копировать ссылку">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
          <a href={article.url} target="_blank" rel="noopener noreferrer"
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--color-text-muted)' }} title="Открыть оригинал">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs mb-2.5">
        <span className="badge" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
          {article.sourceName}
        </span>
        <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          <Calendar className="w-3 h-3" /> {date}
        </span>
        {article.author && (
          <span style={{ color: 'var(--color-text-muted)' }}>{article.author}</span>
        )}
      </div>

      {article.imageUrl && (
        <div className="mb-3 rounded-lg overflow-hidden max-h-48" style={{ background: 'var(--color-bg)' }}>
          <img src={article.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}

      <p className={`text-sm leading-relaxed ${!expanded && hasMore ? 'line-clamp-4' : ''}`}
        style={{ color: 'var(--color-text-secondary)' }}>
        {expanded ? article.bodyText : preview}
      </p>

      {hasMore && (
        <button onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--color-primary)' }}>
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Свернуть</>
            : <><ChevronDown className="w-3.5 h-3.5" /> Читать полностью</>}
        </button>
      )}

      {article.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Tag className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
          {article.tags.slice(0, 8).map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded text-xs"
              style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
              {tag}
            </span>
          ))}
          {article.tags.length > 8 && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>+{article.tags.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}
