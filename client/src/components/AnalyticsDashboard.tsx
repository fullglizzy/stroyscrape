import { useState, useEffect } from 'react';
import { api, SourceStats } from '../api';
import {
  TrendingUp, TrendingDown, BarChart3, Loader2, Sparkles, Calendar,
  ChevronDown, ChevronUp, Minus,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  sources: SourceStats;
}

interface TrendData {
  metric: string;
  trend: { date: string; value: string; direction: string }[];
}

export default function AnalyticsDashboard({ sources }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('stroyscrape_deepseek_key') || '');
  const [extracting, setExtracting] = useState(false);
  const [forecasting, setForecasting] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [forecast, setForecast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(7);
  const [expandedForecast, setExpandedForecast] = useState(true);
  const [expandedMetrics, setExpandedMetrics] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, [period]);

  const loadMetrics = async () => {
    try {
      const res = await fetch(`/api/metrics?days=${period}`);
      const data = await res.json();
      setMetrics(data.metrics || []);
    } catch { /* ignore */ }
  };

  // Извлечение метрик
  const handleExtract = async () => {
    if (!apiKey) { setError('Введите API-ключ'); return; }
    setExtracting(true); setError(null);
    try {
      const res = await api.extractMetrics(apiKey, { daysBack: period });
      setError(null);
      await loadMetrics();
    } catch (err: any) { setError(err.message); }
    finally { setExtracting(false); }
  };

  // Прогноз
  const handleForecast = async () => {
    if (!apiKey) { setError('Введите API-ключ'); return; }
    setForecasting(true); setError(null);
    try {
      const res = await api.getForecast(apiKey, period);
      setForecast(res.forecast);
    } catch (err: any) { setError(err.message); }
    finally { setForecasting(false); }
  };

  // Группировка метрик по имени
  const metricGroups: Record<string, any[]> = {};
  for (const m of metrics) {
    if (!metricGroups[m.metricName]) metricGroups[m.metricName] = [];
    metricGroups[m.metricName].push(m);
  }

  // Подсчёт up/down/flat
  const counts = { up: 0, down: 0, flat: 0 };
  for (const m of metrics) {
    if (m.direction === 'up') counts.up++;
    else if (m.direction === 'down') counts.down++;
    else counts.flat++;
  }

  return (
    <div className="space-y-6">
      {/* Заголовок + управление */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">Аналитика рынка</h2>
          </div>
          <div className="flex items-center gap-3">
            {[1, 3, 7, 14, 30].map(d => (
              <button key={d}
                onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >{d === 1 ? 'Сегодня' : `${d} дн.`}</button>
            ))}
            <button onClick={handleExtract} disabled={extracting || !apiKey}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Извлечь метрики
            </button>
            <button onClick={handleForecast} disabled={forecasting || !apiKey}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {forecasting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Прогноз
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
      </div>

      {/* Карточки роста/падения */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{counts.up}</div>
              <div className="text-xs text-gray-500">Растёт ▲</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{counts.down}</div>
              <div className="text-xs text-gray-500">Падает ▼</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Minus className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">{counts.flat}</div>
              <div className="text-xs text-gray-500">Стабильно</div>
            </div>
          </div>
        </div>
      )}

      {/* Графики трендов */}
      {Object.keys(metricGroups).length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <button onClick={() => setExpandedMetrics(!expandedMetrics)}
            className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-700 w-full text-left"
          >
            {expandedMetrics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Метрики по сегментам ({metrics.length})
          </button>
          {expandedMetrics && (
            <div className="space-y-6">
              {Object.entries(metricGroups).slice(0, 6).map(([name, items]) => {
                const chartData = items.map(m => ({
                  date: m.extractedAt?.slice(0, 10) || '',
                  value: parseFloat(m.metricValue) || 0,
                  label: m.metricValue,
                })).filter(d => d.date);

                return (
                  <div key={name}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${
                        items[0]?.direction === 'up' ? 'bg-green-500' : items[0]?.direction === 'down' ? 'bg-red-500' : 'bg-gray-400'
                      }`} />
                      <span className="text-sm font-medium text-gray-700">{name}</span>
                      <span className="text-xs text-gray-400">({items[0]?.segment})</span>
                    </div>
                    {chartData.length >= 2 ? (
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-xs text-gray-400">Недостаточно данных для графика</div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {items.slice(0, 5).map((m, i) => (
                        <span key={i} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                          {m.metricValue}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI Прогноз */}
      {forecast && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-200 shadow-sm p-5">
          <button onClick={() => setExpandedForecast(!expandedForecast)}
            className="flex items-center gap-2 mb-3 text-sm font-semibold text-purple-800 w-full text-left"
          >
            {expandedForecast ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <Sparkles className="w-4 h-4" /> AI-Прогноз на неделю
          </button>
          {expandedForecast && (
            <div className="text-sm">
              <MarkdownRenderer text={forecast} />
            </div>
          )}
        </div>
      )}

      {/* Нет данных */}
      {metrics.length === 0 && !extracting && (
        <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-500">Нет извлечённых метрик</h3>
          <p className="text-sm text-gray-400 mt-1">
            Нажмите «Извлечь метрики» чтобы AI проанализировал статьи и выделил тренды
          </p>
        </div>
      )}
    </div>
  );
}
