import { useState, useEffect } from 'react';
import { SourceStats } from '../api';
import {
  TrendingUp, TrendingDown, BarChart3, Loader2, Sparkles, Minus, Zap, Target,
  Activity, ArrowUpRight, ArrowDownRight, Clock, FileText, Brain,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from '../ToastContext';
import { EmptyState } from './ui';
import { ExtractionProgress } from '../useAnalytics';

interface Props {
  sources: SourceStats;
  analytics: {
    metrics: any[];
    forecast: string | null;
    extracting: boolean;
    forecasting: boolean;
    extractProgress: ExtractionProgress | null;
    forecastProgress: ExtractionProgress | null;
    loadMetrics: (days: number) => Promise<void>;
    startExtraction: (apiKey: string, days: number) => Promise<void>;
    startForecast: (apiKey: string, days: number) => Promise<void>;
    setForecast: (f: string | null) => void;
  };
}

const PERIODS = [1, 3, 7, 14, 30];
const PERIOD_LABELS: Record<number, string> = { 1: '24ч', 3: '3д', 7: '7д', 14: '14д', 30: '30д' };

export default function AnalyticsDashboard({ sources, analytics }: Props) {
  const {
    metrics, forecast, extracting, forecasting,
    extractProgress, forecastProgress,
    loadMetrics, startExtraction, startForecast, setForecast,
  } = analytics;

  const [apiKey] = useState(() => localStorage.getItem('stroyscrape_deepseek_key') || '');
  const [period, setPeriod] = useState(7);
  const toast = useToast();

  useEffect(() => { loadMetrics(period); }, [period]);

  // Группировка метрик
  const metricGroups: Record<string, any[]> = {};
  for (const m of metrics) {
    if (!metricGroups[m.metricName]) metricGroups[m.metricName] = [];
    metricGroups[m.metricName].push(m);
  }

  // Статистика направлений
  const dirCounts = { up: 0, down: 0, flat: 0 };
  const bySegment: Record<string, { up: number; down: number; flat: number; items: any[] }> = {};
  for (const m of metrics) {
    if (m.direction === 'up') dirCounts.up++;
    else if (m.direction === 'down') dirCounts.down++;
    else dirCounts.flat++;
    if (!bySegment[m.segment]) bySegment[m.segment] = { up: 0, down: 0, flat: 0, items: [] };
    bySegment[m.segment][m.direction as 'up' | 'down' | 'flat']++;
    bySegment[m.segment].items.push(m);
  }

  const total = metrics.length;
  const upPct = total > 0 ? Math.round((dirCounts.up / total) * 100) : 0;
  const downPct = total > 0 ? Math.round((dirCounts.down / total) * 100) : 0;

  const handleExtract = async () => {
    if (!apiKey) { toast.error('Введите API-ключ DeepSeek'); return; }
    try { await startExtraction(apiKey, period); }
    catch (err: any) { toast.error(err.message); }
  };

  const handleForecast = async () => {
    if (!apiKey) { toast.error('Введите API-ключ DeepSeek'); return; }
    try { await startForecast(apiKey, period); }
    catch (err: any) { toast.error(err.message); }
  };

  // График sentiment
  const sentimentData = metrics.length > 0 ? [
    { name: 'Растёт', value: dirCounts.up, color: 'var(--color-success)' },
    { name: 'Падает', value: dirCounts.down, color: 'var(--color-danger)' },
    { name: 'Стабильно', value: dirCounts.flat, color: 'var(--color-text-muted)' },
  ] : [];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* ============ HEADER ROW ============ */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Аналитика рынка</h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {metrics.length > 0 ? `${metrics.length} метрик • ${Object.keys(metricGroups).length} показателей` : 'Данные не загружены'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {PERIODS.map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                disabled={extracting || forecasting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={period === d
                  ? { background: 'var(--color-primary)', color: 'white' }
                  : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }
                }>{PERIOD_LABELS[d]}</button>
            ))}
            <span className="w-px h-6 mx-1" style={{ background: 'var(--color-border)' }} />
            <button onClick={handleExtract} disabled={extracting}
              className="btn text-xs font-medium" style={{ background: 'var(--color-success)', color: 'white' }}>
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {extracting ? '...' : 'Метрики'}
            </button>
            <button onClick={handleForecast} disabled={forecasting}
              className="btn text-xs font-medium" style={{ background: 'var(--color-purple)', color: 'white' }}>
              {forecasting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
              {forecasting ? '...' : 'Прогноз'}
            </button>
          </div>
        </div>

        {/* Progress bar during extraction */}
        {(extracting && extractProgress) && (
          <div className="mt-3 animate-slide-down">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span style={{ color: 'var(--color-text-secondary)' }}>
                <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                Извлечение метрик: {extractProgress.done}/{extractProgress.total}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {Math.round((extractProgress.done / extractProgress.total) * 100)}%
              </span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{
                width: `${Math.round((extractProgress.done / extractProgress.total) * 100)}%`,
                background: 'var(--color-success)',
              }} />
            </div>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-text-muted)' }}>
              {extractProgress.currentItem}
            </p>
          </div>
        )}

        {/* Progress during forecast */}
        {(forecasting && forecastProgress) && (
          <div className="mt-3 animate-slide-down">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{forecastProgress.currentItem}</span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full"
                    style={{ background: i < forecastProgress.done ? 'var(--color-purple)' : 'var(--color-border)' }} />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ============ NO DATA STATE ============ */}
      {metrics.length === 0 && !extracting && (
        <EmptyState
          icon={<BarChart3 className="w-16 h-16" />}
          title="Аналитика рынка"
          description="AI проанализирует статьи, извлечёт метрики (цены, ставки, спрос) и построит тренды. Нажмите «Метрики» чтобы начать."
          action={
            <button onClick={handleExtract} className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
              <Zap className="w-4 h-4" /> Извлечь метрики
            </button>
          }
        />
      )}

      {metrics.length > 0 && (
        <>
          {/* ============ KPI CARDS ============ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <KpiCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Растёт"
              value={`${upPct}%`}
              sub={`${dirCounts.up} метрик`}
              color="var(--color-success)"
            />
            <KpiCard
              icon={<TrendingDown className="w-5 h-5" />}
              label="Падает"
              value={`${downPct}%`}
              sub={`${dirCounts.down} метрик`}
              color="var(--color-danger)"
            />
            <KpiCard
              icon={<Activity className="w-5 h-5" />}
              label="Показателей"
              value={String(Object.keys(metricGroups).length)}
              sub={`${Object.keys(bySegment).length} сегментов`}
              color="var(--color-primary)"
            />
            <KpiCard
              icon={<Target className="w-5 h-5" />}
              label="Точность"
              value={total > 0 ? `${Math.round(metrics.reduce((s: number, m: any) => s + m.confidence, 0) / total * 100)}%` : '—'}
              sub="AI confidence"
              color="var(--color-purple)"
            />
          </div>

          {/* ============ CHARTS GRID ============ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Sentiment donut-like bar */}
            <div className="card p-4 md:p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <Activity className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                Пульс рынка
              </h3>
              <div className="space-y-3">
                {sentimentData.map(s => (
                  <div key={s.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
                      <span className="font-medium" style={{ color: s.color }}>{s.value}</span>
                    </div>
                    <div className="progress-bar" style={{ height: 8, borderRadius: 4 }}>
                      <div className="progress-bar-fill" style={{
                        width: `${total > 0 ? Math.round((s.value / total) * 100) : 0}%`,
                        background: s.color, borderRadius: 4,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top metrics trend chart */}
            <div className="card p-4 md:p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                Динамика ключевых метрик
              </h3>
              {Object.entries(metricGroups).slice(0, 1).map(([name, items]) => {
                const data = items.map(m => ({
                  dt: m.extractedAt?.slice(0, 10) || '',
                  v: parseFloat(m.metricValue) || 0,
                })).filter((d: any) => d.dt).reverse();
                return data.length >= 2 ? (
                  <ResponsiveContainer key={name} width="100%" height={160}>
                    <AreaChart data={data}>
                      <defs>
                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="dt" tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                      <Tooltip contentStyle={{
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        borderRadius: 8, fontSize: 12,
                      }} />
                      <Area type="monotone" dataKey="v" stroke="var(--color-primary)" fill="url(#colorVal)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : null;
              })}
            </div>
          </div>

          {/* ============ SEGMENT BREAKDOWN ============ */}
          {Object.keys(bySegment).length > 0 && (
            <div className="card p-4 md:p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <Target className="w-4 h-4" style={{ color: 'var(--color-purple)' }} />
                По сегментам рынка
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(bySegment).map(([seg, data]) => {
                  const segTotal = data.up + data.down + data.flat;
                  return (
                    <div key={seg} className="p-3 rounded-lg" style={{ background: 'var(--color-bg)' }}>
                      <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {segLabels[seg] || seg}
                      </div>
                      <div className="flex items-end gap-2 h-12">
                        {data.up > 0 && (
                          <div className="flex-1 rounded-t" style={{
                            height: `${Math.max(10, (data.up / segTotal) * 100)}%`,
                            background: 'var(--color-success)', opacity: 0.7,
                          }} title={`Рост: ${data.up}`} />
                        )}
                        {data.down > 0 && (
                          <div className="flex-1 rounded-t" style={{
                            height: `${Math.max(10, (data.down / segTotal) * 100)}%`,
                            background: 'var(--color-danger)', opacity: 0.7,
                          }} title={`Падение: ${data.down}`} />
                        )}
                        {data.flat > 0 && (
                          <div className="flex-1 rounded-t" style={{
                            height: `${Math.max(10, (data.flat / segTotal) * 100)}%`,
                            background: 'var(--color-text-muted)', opacity: 0.5,
                          }} title={`Стабильно: ${data.flat}`} />
                        )}
                      </div>
                      <div className="flex gap-2 mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {data.up > 0 && <span style={{ color: 'var(--color-success)' }}>▲{data.up}</span>}
                        {data.down > 0 && <span style={{ color: 'var(--color-danger)' }}>▼{data.down}</span>}
                        <span>{segTotal} всего</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============ METRICS TABLE ============ */}
          <div className="card p-4 md:p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <FileText className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              Все метрики ({metrics.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th className="text-left py-2 px-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Метрика</th>
                    <th className="text-left py-2 px-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Значение</th>
                    <th className="text-left py-2 px-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Тренд</th>
                    <th className="text-left py-2 px-2 text-xs font-medium hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>Сегмент</th>
                    <th className="text-right py-2 px-2 text-xs font-medium hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>Точность</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.slice(0, 20).map((m: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}
                      className="hover:transition-colors">
                      <td className="py-2 px-2 font-medium" style={{ color: 'var(--color-text)' }}>{m.metricName}</td>
                      <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{m.metricValue}</td>
                      <td className="py-2 px-2">
                        {m.direction === 'up' ? <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                          : m.direction === 'down' ? <ArrowDownRight className="w-4 h-4" style={{ color: 'var(--color-danger)' }} />
                            : <Minus className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />}
                      </td>
                      <td className="py-2 px-2 hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                        {segLabels[m.segment] || m.segment}
                      </td>
                      <td className="py-2 px-2 text-right hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                        {Math.round(m.confidence * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============ FORECAST ============ */}
      {forecast && (
        <div className="card p-4 md:p-5 animate-slide-up"
          style={{ borderColor: 'var(--color-purple)', background: 'var(--color-purple-bg)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5" style={{ color: 'var(--color-purple)' }} />
              <h3 className="font-semibold" style={{ color: 'var(--color-purple)' }}>AI-Прогноз на неделю</h3>
            </div>
            <button onClick={() => setForecast(null)}
              className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>скрыть</button>
          </div>
          <MarkdownRenderer text={forecast} />
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="card p-3 md:p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '18', color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
        <div className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{value}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{sub}</div>
      </div>
    </div>
  );
}

const segLabels: Record<string, string> = {
  'ипотека': 'Ипотека',
  'цены': 'Цены',
  'спрос': 'Спрос',
  'ввод_жилья': 'Ввод жилья',
  'себестоимость': 'Себестоимость',
  'регуляторика': 'Регуляторика',
  'инвестиции': 'Инвестиции',
  'другое': 'Другое',
};
