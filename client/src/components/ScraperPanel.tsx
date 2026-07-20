import { useState } from 'react';
import { Play, RefreshCw, Loader2, CircleCheck, CircleAlert, ChevronDown, Square } from 'lucide-react';
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
  const percent = progress ? Math.round((progress.doneSources / progress.totalSources) * 100) : 0;
  const lastRun = status?.lastRun ? new Date(status.lastRun).toLocaleString('ru-RU') : null;

  const sourceEntries = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);

  const handleStart = () => {
    onStartScrape(selectedSource || undefined);
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {/* Выбор источника */}
          <div className="relative">
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              disabled={isRunning}
              className="appearance-none bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-9 py-2.5 text-sm text-gray-700 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <option value="">Все источники</option>
              {sourceEntries.map(([id, info]) => (
                <option key={id} value={id}>
                  {info.name} ({info.count})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Кнопка запуска */}
          <button
            onClick={handleStart}
            disabled={isRunning}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all
              ${isRunning
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-sm'
              }
            `}
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning
              ? 'Парсинг...'
              : selectedSource
                ? `Парсить ${sources[selectedSource]?.name || selectedSource}`
                : 'Запустить парсинг'
            }
          </button>

          {/* Кнопка остановки */}
          {isRunning && (
            <button
              onClick={onStopScrape}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 transition-all border border-red-200"
            >
              <Square className="w-4 h-4" />
              Стоп
            </button>
          )}

          {/* Обновить */}
          <button
            onClick={onRefresh}
            disabled={loading || isRunning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>

        {/* Статус */}
        <div className="flex items-center gap-4 text-sm">
          {isRunning && progress && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-gray-600">
                {progress.currentSource}: {progress.doneSources}/{progress.totalSources}
              </span>
              <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {!isRunning && lastRun && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <CircleCheck className="w-4 h-4 text-green-500" />
              <span>Последний запуск: {lastRun}</span>
              <button
                onClick={onResetStatus}
                className="ml-2 text-xs text-gray-400 hover:text-red-500 transition-colors underline"
                title="Сбросить статус (если завис)"
              >
                сбросить
              </button>
            </div>
          )}

          {!isRunning && !lastRun && (
            <div className="flex items-center gap-1.5 text-gray-400">
              <CircleAlert className="w-4 h-4" />
              <span>Парсинг ещё не запускался</span>
            </div>
          )}
        </div>
      </div>

      {/* Ошибки */}
      {status?.errors && status.errors.length > 0 && !isRunning && (
        <details className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg p-3">
          <summary className="cursor-pointer font-medium">
            Ошибки при последнем запуске ({status.errors.length})
          </summary>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            {status.errors.map((e, i) => (
              <li key={i}>
                <strong>{e.source}</strong>{e.url ? ` (${e.url})` : ''}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
