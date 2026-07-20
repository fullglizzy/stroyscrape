import { useState } from 'react';
import { Play, RefreshCw, Loader2, CircleCheck, CircleAlert, ChevronDown, Square, AlertTriangle } from 'lucide-react';
import { ScrapeStatus, SourceStats } from '../api';

interface Props {
  status: ScrapeStatus | null;
  sources: SourceStats;
  onStartScrape: (sourceId?: string) => void;
  onStopScrape: () => void;
  onResetStatus: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export default function ScraperPanel({ status, sources, onStartScrape, onStopScrape, onResetStatus, onRefresh, loading }: Props) {
  const [selectedSource, setSelectedSource] = useState<string>('');
  const isRunning = status?.running ?? false;
  const progress = status?.progress;
  const percent = progress && progress.totalSources > 0
    ? Math.round((progress.doneSources / progress.totalSources) * 100)
    : 0;
  const lastRun = status?.lastRun ? new Date(status.lastRun).toLocaleString('ru-RU') : null;
  const errors = status?.errors || [];

  const sourceEntries = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source selector */}
          <div className="relative">
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              disabled={isRunning}
              className="appearance-none rounded-lg pl-3 pr-8 py-2 text-sm cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              <option value="">Все источники</option>
              {sourceEntries.map(([id, info]) => (
                <option key={id} value={id}>{info.name} ({info.count})</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
          </div>

          {/* Start button */}
          <button onClick={() => onStartScrape(selectedSource || undefined)} disabled={isRunning}
            className="btn btn-primary">
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Идёт парсинг...' : selectedSource ? 'Парсить источник' : 'Запустить парсинг'}
          </button>

          {/* Stop button */}
          {isRunning && (
            <button onClick={onStopScrape} className="btn btn-danger">
              <Square className="w-4 h-4" /> Стоп
            </button>
          )}

          {/* Refresh */}
          <button onClick={onRefresh} disabled={loading || isRunning}
            className="btn btn-ghost text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3 text-sm">
          {isRunning && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-primary)' }} />
              <span className="hidden sm:inline" style={{ color: 'var(--color-text-secondary)' }}>
                {progress?.currentSource} <span className="text-xs">({progress?.doneSources}/{progress?.totalSources})</span>
              </span>
              <div className="progress-bar w-24 md:w-32">
                <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
          {!isRunning && lastRun && (
            <div className="flex items-center gap-1.5">
              <CircleCheck className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              <span className="hidden sm:inline" style={{ color: 'var(--color-text-secondary)' }}>Готово: {lastRun}</span>
              <button onClick={onResetStatus} className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
                сброс
              </button>
            </div>
          )}
          {!isRunning && !lastRun && (
            <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <CircleAlert className="w-4 h-4" />
              <span className="hidden sm:inline">Ожидание запуска</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress detail */}
      {isRunning && progress && (
        <div className="mt-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {progress.currentStep}
          {progress.totalArticles > 0 && (
            <span className="ml-2">• Собрано: <strong>{progress.totalArticles}</strong> статей</span>
          )}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && !isRunning && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs flex items-center gap-1" style={{ color: 'var(--color-danger)' }}>
            <AlertTriangle className="w-3 h-3" /> Ошибок: {errors.length}
          </summary>
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto text-xs" style={{ color: 'var(--color-danger)' }}>
            {errors.slice(0, 10).map((e, i) => (
              <div key={i} className="px-2 py-1 rounded" style={{ background: 'var(--color-danger-bg)' }}>
                <strong>{e.source}</strong>: {e.message}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
