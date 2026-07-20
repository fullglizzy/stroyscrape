import { useState, useEffect } from 'react';
import { SourceStats, api } from '../api';
import {
  Sparkles, Key, FileText, Loader2, Check, Trash2, Copy,
  ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';

interface Props {
  sources: SourceStats;
}

interface SummaryResult {
  sourceId: string;
  sourceName: string;
  articleCount: number;
  dateRange: { from: string; to: string };
  summary: string;
  error?: string;
}

const LS_KEY = 'stroyscrape_deepseek_key';
const LS_SOURCES = 'stroyscrape_summarize_sources';
const LS_DAYS = 'stroyscrape_summarize_days';

const DAY_OPTIONS = [
  { value: 1, label: 'Сегодня' },
  { value: 3, label: 'За 3 дня' },
  { value: 7, label: 'За 7 дней' },
  { value: 14, label: 'За 2 недели' },
  { value: 30, label: 'За 30 дней' },
];

export default function AISummarizer({ sources }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY) || '');
  const [showKey, setShowKey] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(LS_SOURCES);
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [daysBack, setDaysBack] = useState(() => {
    const saved = localStorage.getItem(LS_DAYS);
    return saved ? parseInt(saved, 10) : 7;
  });
  const [summarizing, setSummarizing] = useState(false);
  const [results, setResults] = useState<SummaryResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Сохраняем в localStorage
  useEffect(() => {
    if (apiKey) localStorage.setItem(LS_KEY, apiKey);
    else localStorage.removeItem(LS_KEY);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(LS_SOURCES, JSON.stringify([...selectedSources]));
  }, [selectedSources]);

  useEffect(() => {
    localStorage.setItem(LS_DAYS, String(daysBack));
  }, [daysBack]);

  const sourceList = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);

  const toggleSource = (id: string) => {
    const next = new Set(selectedSources);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedSources(next);
  };

  const selectAll = () => {
    if (selectedSources.size === sourceList.length) {
      setSelectedSources(new Set());
    } else {
      setSelectedSources(new Set(sourceList.map(([id]) => id)));
    }
  };

  const clearResults = () => setResults([]);
  const copyAll = () => {
    const text = results
      .map(r => `=== ${r.sourceName} (${r.articleCount} ст.) ===\n${r.summary}\n`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  const handleSummarize = async () => {
    if (!apiKey.trim()) { setError('Введите API-ключ DeepSeek'); return; }
    if (selectedSources.size === 0) { setError('Выберите хотя бы один источник'); return; }

    setSummarizing(true);
    setError(null);
    setResults([]);

    try {
      const res = await api.summarizeSources(apiKey.trim(), {
        sourceIds: Array.from(selectedSources),
        daysBack,
        maxLength: 400,
      });
      setResults(res.summaries);
      // Авто-раскрываем все результаты
      setExpandedResults(new Set(res.summaries.map((_, i) => i)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* API-ключ */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-5 h-5 text-amber-500" />
          <h2 className="font-semibold text-gray-800">DeepSeek API</h2>
          {apiKey && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              сохранён
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
      </div>

      {/* Выбор источников + периода */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h2 className="font-semibold text-gray-800">Параметры сводки</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Выбор источников */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">
                Источники ({selectedSources.size})
              </span>
              <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800">
                {selectedSources.size === sourceList.length ? 'Снять всё' : 'Выбрать всё'}
              </button>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {sourceList.map(([id, info]) => (
                <button
                  key={id}
                  onClick={() => toggleSource(id)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors
                    ${selectedSources.has(id)
                      ? 'bg-purple-50 text-purple-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                    ${selectedSources.has(id) ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}
                  `}>
                    {selectedSources.has(id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="truncate flex-1">{info.name}</span>
                  <span className="text-xs text-gray-400">({info.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Выбор периода */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Период выборки</span>
            </div>
            <div className="space-y-1">
              {DAY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDaysBack(opt.value)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors
                    ${daysBack === opt.value
                      ? 'bg-purple-50 text-purple-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                    ${daysBack === opt.value ? 'border-purple-600' : 'border-gray-300'}
                  `}>
                    {daysBack === opt.value && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Кнопка запуска */}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={handleSummarize}
            disabled={summarizing || selectedSources.size === 0}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all
              ${summarizing || selectedSources.size === 0
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
              ? `Суммаризация ${selectedSources.size} источников...`
              : `Суммаризировать ${selectedSources.size} источников за ${daysBack} дн.`
            }
          </button>

          {results.length > 0 && (
            <>
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Копировать всё
              </button>
              <button
                onClick={clearResults}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Очистить
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
        )}
      </div>

      {/* Результаты */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result, idx) => {
            const isExpanded = expandedResults.has(idx);

            return (
              <div
                key={result.sourceId}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  result.error ? 'border-red-200' : 'border-gray-200'
                }`}
              >
                <button
                  onClick={() => {
                    const next = new Set(expandedResults);
                    isExpanded ? next.delete(idx) : next.add(idx);
                    setExpandedResults(next);
                  }}
                  className="w-full flex items-start gap-3 p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <h3 className="text-base font-semibold text-gray-800">
                        {result.sourceName}
                      </h3>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {result.articleCount} статей
                      </span>
                      <span className="text-xs text-gray-400">
                        {result.dateRange.from} – {result.dateRange.to}
                      </span>
                      {result.error && (
                        <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                          Ошибка
                        </span>
                      )}
                    </div>
                    {!result.error && !isExpanded && (
                      <p className="text-sm text-gray-500 line-clamp-3 mt-1">
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
                    <div className="flex-shrink-0 mt-1">
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
      )}
    </div>
  );
}
