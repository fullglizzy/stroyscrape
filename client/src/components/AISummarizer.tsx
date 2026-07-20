import { useState, useEffect } from 'react';
import { Article, SourceStats, api } from '../api';
import {
  Sparkles, Key, FileText, Loader2, CheckSquare, Square,
  Trash2, Copy, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Props {
  articles: Article[];
  sources: SourceStats;
}

const LS_KEY = 'stroyscrape_deepseek_key';

export default function AISummarizer({ articles, sources }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY) || '');
  const [showKey, setShowKey] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [summarizing, setSummarizing] = useState(false);
  const [results, setResults] = useState<Map<string, { title: string; summary: string; error?: string }>>(new Map());
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Сохраняем ключ в localStorage
  useEffect(() => {
    if (apiKey) localStorage.setItem(LS_KEY, apiKey);
    else localStorage.removeItem(LS_KEY);
  }, [apiKey]);

  // Выбрать / снять все
  const toggleAll = () => {
    if (selectedIds.size === articles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map(a => a.id)));
    }
  };

  const toggleArticle = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  // Очистить результаты
  const clearResults = () => {
    setResults(new Map());
    setError(null);
  };

  // Копировать все саммари в буфер
  const copyAll = () => {
    const text = Array.from(results.values())
      .map(r => `${r.title}\n${r.summary}\n---`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  // Запустить суммаризацию
  const handleSummarize = async () => {
    if (!apiKey.trim()) {
      setError('Введите API-ключ DeepSeek');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Выберите статьи для суммаризации');
      return;
    }

    setSummarizing(true);
    setError(null);
    setProgress({ done: 0, total: selectedIds.size });

    try {
      const ids = Array.from(selectedIds);
      const res = await api.summarizeBatch(ids, apiKey.trim(), 300);

      const newResults = new Map(results);
      for (const r of res.results) {
        newResults.set(r.id, { title: r.title, summary: r.summary, error: r.error });
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }
      setResults(newResults);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSummarizing(false);
    }
  };

  // Группировка статей по источнику
  const articlesBySource: Record<string, Article[]> = {};
  for (const a of articles) {
    if (!articlesBySource[a.source]) articlesBySource[a.source] = [];
    articlesBySource[a.source].push(a);
  }

  return (
    <div className="space-y-6">
      {/* API-ключ */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-5 h-5 text-amber-500" />
          <h2 className="font-semibold text-gray-800">DeepSeek API</h2>
          {apiKey && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              ключ сохранён
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
          >
            {showKey ? 'Скрыть' : 'Показать'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Ключ хранится в localStorage браузера. Запросы идут через сервер.
        </p>
      </div>

      {/* Выбор статей + кнопка */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h2 className="font-semibold text-gray-800">
              Выбрано: {selectedIds.size} из {articles.length}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              {selectedIds.size === articles.length ? 'Снять всё' : 'Выбрать всё'}
            </button>
            {results.size > 0 && (
              <>
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  Копировать
                </button>
                <button
                  onClick={clearResults}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Очистить
                </button>
              </>
            )}
          </div>
        </div>

        {/* Список статей с чекбоксами */}
        <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
          {Object.entries(articlesBySource).map(([sourceId, sourceArticles]) => {
            const info = sources[sourceId];
            return (
              <div key={sourceId}>
                <div className="text-xs font-medium text-gray-500 mb-1.5 sticky top-0 bg-white py-1">
                  {info?.name || sourceId} ({sourceArticles.length})
                </div>
                {sourceArticles.map(article => (
                  <label
                    key={article.id}
                    className={`
                      flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors
                      ${selectedIds.has(article.id) ? 'bg-purple-50' : 'hover:bg-gray-50'}
                      ${results.has(article.id) ? 'border-l-2 border-green-400 pl-1.5' : ''}
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(article.id)}
                      onChange={() => toggleArticle(article.id)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                    />
                    <div>
                      <span className="text-sm text-gray-800">{article.title}</span>
                      {results.has(article.id) && (
                        <span className="ml-2 text-xs text-green-600">✓</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            );
          })}
        </div>

        {/* Кнопка суммаризации */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSummarize}
            disabled={summarizing || selectedIds.size === 0}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all
              ${summarizing || selectedIds.size === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95 shadow-sm'
              }
            `}
          >
            {summarizing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {summarizing
              ? `Суммаризация... ${progress.done}/${progress.total}`
              : `Суммаризировать (${selectedIds.size})`
            }
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      {/* Результаты */}
      {results.size > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-green-500" />
            <h2 className="font-semibold text-gray-800">
              Результаты ({results.size})
            </h2>
          </div>

          <div className="space-y-3">
            {Array.from(results.entries()).map(([id, result]) => {
              const isExpanded = expandedResults.has(id);
              const article = articles.find(a => a.id === id);
              const sourceName = article ? sources[article.source]?.name || article.sourceName : '';

              return (
                <div
                  key={id}
                  className={`border rounded-lg overflow-hidden transition-colors ${
                    result.error ? 'border-red-200 bg-red-50' : 'border-gray-200'
                  }`}
                >
                  <button
                    onClick={() => {
                      const next = new Set(expandedResults);
                      isExpanded ? next.delete(id) : next.add(id);
                      setExpandedResults(next);
                    }}
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {sourceName}
                        </span>
                        {result.error && (
                          <span className="text-xs text-red-500">Ошибка</span>
                        )}
                        {!result.error && !isExpanded && (
                          <span className="text-xs text-gray-400">Нажмите чтобы развернуть</span>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-gray-800 leading-snug">
                        {result.title}
                      </h3>
                      {!result.error && !isExpanded && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {result.summary}
                        </p>
                      )}
                      {!result.error && isExpanded && (
                        <div className="text-sm text-gray-700 mt-2 whitespace-pre-line leading-relaxed">
                          {result.summary}
                        </div>
                      )}
                      {result.error && (
                        <p className="text-xs text-red-500 mt-1">{result.error}</p>
                      )}
                    </div>
                    {!result.error && (
                      <div className="flex-shrink-0 mt-0.5">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
