import { useState, useEffect } from 'react';
import { SourceStats, api } from '../api';
import {
  Sparkles, Key, FileText, Loader2, Check, Trash2, Copy,
  ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from '../ToastContext';

interface Props { sources: SourceStats; }
interface SummaryResult {
  sourceId: string; sourceName: string; articleCount: number;
  dateRange: { from: string; to: string }; summary: string; error?: string;
}

const LS_KEY = 'stroyscrape_deepseek_key';
const LS_SOURCES = 'stroyscrape_summarize_sources';
const LS_DAYS = 'stroyscrape_summarize_days';
const DAY_OPTIONS = [1, 3, 7, 14, 30];
const DAY_LABELS: Record<number, string> = { 1: 'Сегодня', 3: '3 дня', 7: '7 дней', 14: '2 недели', 30: '30 дней' };

export default function AISummarizer({ sources }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY) || '');
  const [showKey, setShowKey] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(() => {
    try { const saved = localStorage.getItem(LS_SOURCES); return saved ? new Set(JSON.parse(saved)) : new Set<string>(); }
    catch { return new Set<string>(); }
  });
  const [daysBack, setDaysBack] = useState(() => parseInt(localStorage.getItem(LS_DAYS) || '7', 10));
  const [summarizing, setSummarizing] = useState(false);
  const [results, setResults] = useState<SummaryResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const toast = useToast();

  useEffect(() => { apiKey ? localStorage.setItem(LS_KEY, apiKey) : localStorage.removeItem(LS_KEY); }, [apiKey]);
  useEffect(() => { localStorage.setItem(LS_SOURCES, JSON.stringify([...selectedSources])); }, [selectedSources]);
  useEffect(() => { localStorage.setItem(LS_DAYS, String(daysBack)); }, [daysBack]);

  const sourceList = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);
  const toggleSource = (id: string) => {
    const next = new Set(selectedSources); next.has(id) ? next.delete(id) : next.add(id);
    setSelectedSources(next);
  };
  const selectAll = () => setSelectedSources(selectedSources.size === sourceList.length ? new Set() : new Set(sourceList.map(([id]) => id)));

  const handleSummarize = async () => {
    if (!apiKey.trim()) { toast.error('Введите API-ключ DeepSeek'); return; }
    if (selectedSources.size === 0) { toast.error('Выберите хотя бы один источник'); return; }
    setSummarizing(true); setResults([]);
    try {
      const res = await api.summarizeSources(apiKey.trim(), { sourceIds: Array.from(selectedSources), daysBack, maxLength: 400 });
      setResults(res.summaries);
      setExpandedResults(new Set(res.summaries.map((_, i) => i)));
      toast.success(`Сводка готова: ${res.summaries.length} источников`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSummarizing(false); }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* API Key */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>DeepSeek API</h2>
          {apiKey && <span className="badge" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>сохранён</span>}
        </div>
        <div className="flex gap-2">
          <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..." className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <button onClick={() => setShowKey(!showKey)} className="btn-ghost text-xs px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--color-border)' }}>{showKey ? 'Скрыть' : 'Показать'}</button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>Ключ в localStorage. Запросы через сервер.</p>
      </div>

      {/* Settings */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5" style={{ color: 'var(--color-purple)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Параметры сводки</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Sources */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Источники ({selectedSources.size})
              </span>
              <button onClick={selectAll} className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                {selectedSources.size === sourceList.length ? 'Снять всё' : 'Выбрать всё'}
              </button>
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {sourceList.map(([id, info]) => (
                <button key={id} onClick={() => toggleSource(id)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors"
                  style={selectedSources.has(id)
                    ? { background: 'var(--color-purple-bg)', color: 'var(--color-purple)' }
                    : { color: 'var(--color-text-secondary)' }
                  }>
                  <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                    style={selectedSources.has(id)
                      ? { background: 'var(--color-purple)', borderColor: 'var(--color-purple)' }
                      : { borderColor: 'var(--color-border)' }
                    }>
                    {selectedSources.has(id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="truncate flex-1">{info.name}</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>({info.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Период</span>
            </div>
            <div className="space-y-1">
              {DAY_OPTIONS.map(d => (
                <button key={d} onClick={() => setDaysBack(d)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors"
                  style={daysBack === d
                    ? { background: 'var(--color-purple-bg)', color: 'var(--color-purple)' }
                    : { color: 'var(--color-text-secondary)' }
                  }>
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: daysBack === d ? 'var(--color-purple)' : 'var(--color-border)' }}>
                    {daysBack === d && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-purple)' }} />}
                  </div>
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button onClick={handleSummarize} disabled={summarizing || selectedSources.size === 0}
            className="btn btn-primary" style={summarizing ? {} : { background: 'var(--color-purple)' }}>
            {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {summarizing ? `Сводка...` : `Суммаризировать (${selectedSources.size})`}
          </button>
          {results.length > 0 && (
            <>
              <button onClick={() => navigator.clipboard.writeText(results.map(r => `=== ${r.sourceName} ===\n${r.summary}\n`).join('\n'))}
                className="btn btn-ghost text-xs"><Copy className="w-3.5 h-3.5" /> Копировать</button>
              <button onClick={() => setResults([])} className="btn btn-ghost text-xs" style={{ color: 'var(--color-danger)' }}>
                <Trash2 className="w-3.5 h-3.5" /> Очистить</button>
            </>
          )}
        </div>
      </div>

      {/* Results */}
      {results.map((result, idx) => {
        const isExpanded = expandedResults.has(idx);
        return (
          <div key={result.sourceId} className="card overflow-hidden animate-slide-up"
            style={{ borderColor: result.error ? 'var(--color-danger)' : 'var(--color-border)' }}>
            <button onClick={() => {
              const next = new Set(expandedResults); isExpanded ? next.delete(idx) : next.add(idx); setExpandedResults(next);
            }} className="w-full flex items-start gap-3 p-4 md:p-5 text-left">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <FileText className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                  <h3 className="text-sm md:text-base font-semibold" style={{ color: 'var(--color-text)' }}>{result.sourceName}</h3>
                  <span className="badge" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>{result.articleCount} ст.</span>
                  {result.error && <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>Ошибка</span>}
                </div>
                {!result.error && !isExpanded && (
                  <p className="text-sm line-clamp-3 mt-1" style={{ color: 'var(--color-text-secondary)' }}>{result.summary.replace(/\*\*/g, '')}</p>
                )}
                {!result.error && isExpanded && <div className="text-sm mt-2"><MarkdownRenderer text={result.summary} /></div>}
                {result.error && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{result.error}</p>}
              </div>
              {!result.error && (isExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />)}
            </button>
          </div>
        );
      })}
    </div>
  );
}
