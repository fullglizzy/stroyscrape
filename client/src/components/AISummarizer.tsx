import { useState, useEffect } from 'react';
import { SourceStats } from '../api';
import {
  Sparkles, FileText, Loader2, Check, Trash2, Copy,
  ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from '../ToastContext';

interface Props {
  sources: SourceStats;
  selectedSources: Set<string>;
}

interface SummaryResult {
  sourceId: string; sourceName: string; articleCount: number;
  dateRange: { from: string; to: string }; summary: string; error?: string;
}

const LS_DAYS = 'stroyscrape_summarize_days';
const DAY_OPTIONS = [1, 3, 7, 14, 30];
const DAY_LABELS: Record<number, string> = { 1: 'Сегодня', 3: '3 дня', 7: '7 дней', 14: '2 недели', 30: '30 дней' };

export default function AISummarizer({ sources, selectedSources }: Props) {
  const [daysBack, setDaysBack] = useState(() => parseInt(localStorage.getItem(LS_DAYS) || '7', 10));
  const [summarizing, setSummarizing] = useState(false);
  const [results, setResults] = useState<SummaryResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const toast = useToast();

  useEffect(() => { localStorage.setItem(LS_DAYS, String(daysBack)); }, [daysBack]);

  const handleSummarize = async () => {
    if (selectedSources.size === 0) { toast.error('Выберите источники в боковой панели'); return; }

    setSummarizing(true);
    setResults([]);

    try {
      const res = await fetch('/api/summarize/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: Array.from(selectedSources),
          daysBack,
          maxLength: 400,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
      const data = await res.json();
      setResults(data.summaries);
      setExpandedResults(new Set(data.summaries.map((_: any, i: number) => i)));
      toast.success(`Сводка готова: ${data.summaries.length} источников`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSummarizing(false);
    }
  };

  const selectedSourceList = Array.from(selectedSources)
    .map(id => sources[id])
    .filter(Boolean);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Settings */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5" style={{ color: 'var(--color-purple)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>AI Сводка по источникам</h2>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            <div className="flex gap-1">
              {DAY_OPTIONS.map(d => (
                <button key={d} onClick={() => setDaysBack(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    daysBack === d ? '' : ''
                  }`}
                  style={daysBack === d
                    ? { background: 'var(--color-purple)', color: 'white' }
                    : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected sources info */}
        <div className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {selectedSources.size === 0
            ? 'Выберите источники в боковой панели слева'
            : `Выбрано источников: ${selectedSources.size} (${selectedSourceList.map(s => s?.name).join(', ')})`}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button onClick={handleSummarize} disabled={summarizing || selectedSources.size === 0}
            className="btn text-sm" style={{ background: 'var(--color-purple)', color: 'white' }}>
            {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {summarizing ? 'Генерация...' : `Суммаризировать (${selectedSources.size})`}
          </button>
          {results.length > 0 && (
            <>
              <button onClick={() => {
                navigator.clipboard.writeText(results.map(r => `=== ${r.sourceName} ===\n${r.summary}\n`).join('\n'));
                toast.success('Скопировано');
              }} className="btn-ghost text-xs"><Copy className="w-3.5 h-3.5" /> Копировать</button>
              <button onClick={() => setResults([])} className="btn-ghost text-xs" style={{ color: 'var(--color-danger)' }}>
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
