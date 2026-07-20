import { useState, useEffect } from 'react';
import { api, SourceStats } from '../api';
import { TrendingUp, TrendingDown, BarChart3, Loader2, Sparkles, Minus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from '../ToastContext';
import { EmptyState } from './ui';

interface Props { sources: SourceStats; }

export default function AnalyticsDashboard({ sources }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('stroyscrape_deepseek_key') || '');
  const [extracting, setExtracting] = useState(false);
  const [forecasting, setForecasting] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [forecast, setForecast] = useState<string | null>(null);
  const [period, setPeriod] = useState(7);
  const toast = useToast();

  useEffect(() => { loadMetrics(); }, [period]);

  const loadMetrics = async () => {
    try {
      const res = await fetch(`/api/metrics?days=${period}`);
      const data = await res.json();
      setMetrics(data.metrics || []);
    } catch { /* ignore */ }
  };

  const handleExtract = async () => {
    if (!apiKey) { toast.error('Введите API-ключ в табе AI Сводка'); return; }
    setExtracting(true);
    try {
      const res = await fetch('/api/metrics/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, daysBack: period }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`Извлечено метрик: ${data.extracted}`);
      await loadMetrics();
    } catch (err: any) { toast.error(err.message); }
    finally { setExtracting(false); }
  };

  const handleForecast = async () => {
    if (!apiKey) { toast.error('Введите API-ключ в табе AI Сводка'); return; }
    setForecasting(true);
    try {
      const res = await api.getForecast(apiKey, period);
      setForecast(res.forecast);
      toast.success('Прогноз готов');
    } catch (err: any) { toast.error(err.message); }
    finally { setForecasting(false); }
  };

  const metricGroups: Record<string, any[]> = {};
  for (const m of metrics) {
    if (!metricGroups[m.metricName]) metricGroups[m.metricName] = [];
    metricGroups[m.metricName].push(m);
  }

  const counts = { up: 0, down: 0, flat: 0 };
  for (const m of metrics) {
    if (m.direction === 'up') counts.up++;
    else if (m.direction === 'down') counts.down++;
    else counts.flat++;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Аналитика рынка</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[1, 3, 7, 14, 30].map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={period === d
                  ? { background: 'var(--color-primary)', color: 'white' }
                  : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }
                }>{d === 1 ? 'Сегодня' : `${d} дн.`}</button>
            ))}
            <button onClick={handleExtract} disabled={extracting}
              className="btn text-xs" style={{ background: 'var(--color-success)', color: 'white' }}>
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {extracting ? '...' : 'Метрики'}
            </button>
            <button onClick={handleForecast} disabled={forecasting}
              className="btn text-xs" style={{ background: 'var(--color-purple)', color: 'white' }}>
              {forecasting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {forecasting ? '...' : 'Прогноз'}
            </button>
          </div>
        </div>
      </div>

      {/* Counters */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-3 animate-fade-in">
          {[
            { icon: <TrendingUp className="w-5 h-5" />, count: counts.up, label: 'Растёт ▲', color: 'var(--color-success)' },
            { icon: <TrendingDown className="w-5 h-5" />, count: counts.down, label: 'Падает ▼', color: 'var(--color-danger)' },
            { icon: <Minus className="w-5 h-5" />, count: counts.flat, label: 'Стабильно', color: 'var(--color-text-muted)' },
          ].map((s, i) => (
            <div key={i} className="card p-3 md:p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: s.color + '18', color: s.color }}>{s.icon}</div>
              <div>
                <div className="text-xl md:text-2xl font-bold" style={{ color: s.color }}>{s.count}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {Object.keys(metricGroups).length > 0 && (
        <div className="card p-4 md:p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
            Тренды ({metrics.length} метрик)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {Object.entries(metricGroups).slice(0, 8).map(([name, items]) => {
              const chartData = items.map(m => ({
                date: m.extractedAt?.slice(0, 10) || '',
                value: parseFloat(m.metricValue) || m.metricValue.length || 0,
                label: m.metricValue,
              })).filter((d: any) => d.date).reverse();

              return (
                <div key={name}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{
                      background: items[0]?.direction === 'up' ? 'var(--color-success)'
                        : items[0]?.direction === 'down' ? 'var(--color-danger)' : 'var(--color-text-muted)'
                    }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{name}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>({items[0]?.segment})</span>
                  </div>
                  {chartData.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                        <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                        <Tooltip contentStyle={{
                          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text)'
                        }} />
                        <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Мало данных для графика</div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {items.slice(0, 3).map((m, i) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                        {m.metricValue}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Forecast */}
      {forecast && (
        <div className="card p-4 md:p-5 animate-slide-up" style={{ borderColor: 'var(--color-purple)', background: 'var(--color-purple-bg)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--color-purple)' }} />
            <h3 className="font-semibold" style={{ color: 'var(--color-purple)' }}>AI-Прогноз</h3>
          </div>
          <MarkdownRenderer text={forecast} />
        </div>
      )}

      {/* Empty state */}
      {metrics.length === 0 && !extracting && (
        <EmptyState
          icon={<BarChart3 className="w-12 h-12" />}
          title="Нет извлечённых метрик"
          description="Нажмите «Метрики» чтобы AI проанализировал статьи и выделил тренды: что растёт, что падает, в каких сегментах."
        />
      )}
    </div>
  );
}
