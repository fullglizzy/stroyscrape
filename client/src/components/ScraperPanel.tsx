import { useState } from 'react';
import { Play, Loader2, CircleCheck, Square, AlertTriangle, ChevronDown } from 'lucide-react';
import { ScrapeStatus, SourceStats } from '../api';

interface Props {
  status: ScrapeStatus | null;
  sources: SourceStats;
  onStartScrape: (sourceId?: string) => void;
  onStopScrape: () => void;
  onResetStatus: () => void;
}

export default function ScraperPanel({ status, sources, onStartScrape, onStopScrape, onResetStatus }: Props) {
  const [selectedSource, setSelectedSource] = useState<string>('');
  const isRunning = status?.running ?? false;
  const progress = status?.progress;
  const percent = progress && progress.totalSources > 0
    ? Math.round((progress.doneSources / progress.totalSources) * 100)
    : 0;
  const lastRun = status?.lastRun ? new Date(status.lastRun).toLocaleString('ru-RU') : null;
  const errors = status?.errors || [];
  const totalArticles = Object.values(sources).reduce((s, info) => s + info.count, 0);

  const sourceEntries = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Main action card */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => onStartScrape(selectedSource || undefined)} disabled={isRunning}
              className="btn text-sm font-medium"
              style={{ background: isRunning ? 'var(--color-text-muted)' : 'var(--color-primary)', color: 'white' }}>
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isRunning ? 'Идёт парсинг...' : selectedSource ? 'Парсить источник' : 'Запустить парсинг'}
            </button>

            {isRunning && (
              <button onClick={onStopScrape} className="btn btn-danger text-sm">
                <Square className="w-4 h-4" /> Остановить
              </button>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 text-sm">
            {isRunning && progress && (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-primary)' }} />
                <span className="hidden sm:inline text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {progress.currentSource || progress.currentStep}
                </span>
              </div>
            )}
            {!isRunning && lastRun && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <CircleCheck className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                <span>Готово: {lastRun}</span>
                <button onClick={onResetStatus} className="underline" style={{ color: 'var(--color-text-muted)' }}>сброс</button>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isRunning && progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {progress.currentStep || `${progress.doneSources}/${progress.totalSources} источников`}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{percent}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            {progress.totalArticles > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Собрано: <strong>{progress.totalArticles}</strong> статей
              </p>
            )}
          </div>
        )}
      </div>

      {/* Source selector + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source selector */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Источник</h3>
          <div className="relative">
            <select value={selectedSource} onChange={e => setSelectedSource(e.target.value)} disabled={isRunning}
              className="appearance-none w-full rounded-lg pl-3 pr-8 py-2 text-sm cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <option value="">Все источники</option>
              {sourceEntries.map(([id, info]) => (
                <option key={id} value={id}>{info.name} ({info.count})</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            {selectedSource ? 'Парсить только выбранный источник' : 'Парсить все 9 источников'}
          </p>
        </div>

        {/* Stats */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Статистика</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-text-muted)' }}>Статей в базе</span>
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>{totalArticles}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-text-muted)' }}>Активных источников</span>
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                {Object.values(sources).filter(s => s.count > 0).length} / {Object.keys(sources).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-text-muted)' }}>Последний запуск</span>
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>{lastRun || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Errors (collapsible) */}
      {errors.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium flex items-center gap-2" style={{ color: 'var(--color-danger)' }}>
            <AlertTriangle className="w-4 h-4" /> Ошибок: {errors.length}
          </summary>
          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto text-xs" style={{ color: 'var(--color-danger)' }}>
            {errors.map((e, i) => (
              <div key={i} className="px-3 py-2 rounded" style={{ background: 'var(--color-danger-bg)' }}>
                <strong>{e.source}</strong>: {e.message}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
