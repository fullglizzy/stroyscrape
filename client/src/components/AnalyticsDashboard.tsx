import { useState, useEffect, useCallback, Fragment } from 'react';
import { SourceStats } from '../api';
import {
  TrendingUp, TrendingDown, BarChart3, Loader2, Sparkles, Zap, Target,
  Activity, Brain, HelpCircle, SlidersHorizontal, AlertTriangle,
  Bell, Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink, Download, Newspaper,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from '../ToastContext';
import { EmptyState } from './ui';
import { ExtractionProgress } from '../useAnalytics';

interface Props {
  sources: SourceStats;
  analytics: {
    metrics: any[]; forecast: string | null;
    extracting: boolean; forecasting: boolean;
    extractProgress: ExtractionProgress | null;
    forecastProgress: ExtractionProgress | null;
    loadMetrics: (days: number) => Promise<void>;
    startExtraction: (apiKey: string, days: number) => Promise<void>;
    startForecast: (apiKey: string, days: number) => Promise<void>;
    setForecast: (f: string | null) => void;
  };
  onNavigate?: (tab: string) => void;
}

const PERIODS = [1, 3, 7, 14, 30, 90, 180, 365];
const PL: Record<number, string> = { 1: '24ч', 3: '3д', 7: '7д', 14: '14д', 30: '30д', 90: '90д', 180: '6м', 365: 'Год' };

export default function AnalyticsDashboard({ sources, analytics, onNavigate }: Props) {
  const { metrics, forecast, extracting, forecasting, extractProgress, forecastProgress,
    loadMetrics, startExtraction, startForecast, setForecast } = analytics;

  const [apiKey] = useState(() => localStorage.getItem('stroyscrape_deepseek_key') || '');
  const [period, setPeriod] = useState(7);
  const [focusMode, setFocusMode] = useState(false); // false=all, true=critical only
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfSliders, setWhatIfSliders] = useState<Record<string, number>>({});
  const [whatIfResult, setWhatIfResult] = useState<string | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [interpreting, setInterpreting] = useState<string | null>(null);
  const [interpretations, setInterpretations] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [sparklines, setSparklines] = useState<Record<string, { sparkline: any[]; direction: string }>>({});

  const toast = useToast();

  useEffect(() => { loadMetrics(period); }, [period]);
  useEffect(() => { loadAlerts(); }, []);
  const loadAlerts = async () => { try { const r = await fetch('/api/alerts'); setAlerts((await r.json()).alerts || []); } catch { /* */ } };

  // Group metrics
  const metricGroups: Record<string, any[]> = {};
  for (const m of metrics) {
    if (!metricGroups[m.metricName]) metricGroups[m.metricName] = [];
    metricGroups[m.metricName].push(m);
  }

  // Stats
  const counts = { up: 0, down: 0, flat: 0 };
  const bySeg: Record<string, { up: number; down: number; flat: number }> = {};
  for (const m of metrics) {
    if (m.direction === 'up') counts.up++; else if (m.direction === 'down') counts.down++; else counts.flat++;
    if (!bySeg[m.segment]) bySeg[m.segment] = { up: 0, down: 0, flat: 0 };
    bySeg[m.segment][m.direction as 'up' | 'down' | 'flat']++;
  }
  const total = metrics.length;
  const totalArticles = Object.values(sources).reduce((s, info) => s + info.count, 0);

  // Filter for focus mode: only metrics with significant recent changes
  const getLatestValue = (items: any[]) => {
    const sorted = [...items].sort((a, b) => b.extractedAt?.localeCompare(a.extractedAt || '') || 0);
    return parseFloat(sorted[0]?.metricValue) || 0;
  };
  const getPrevValue = (items: any[]) => {
    const sorted = [...items].sort((a, b) => b.extractedAt?.localeCompare(a.extractedAt || '') || 0);
    return parseFloat(sorted[1]?.metricValue) || getLatestValue(items);
  };

  const filteredMetrics = focusMode
    ? Object.entries(metricGroups).filter(([, items]) => {
        const curr = getLatestValue(items);
        const prev = getPrevValue(items);
        return prev !== 0 && Math.abs((curr - prev) / prev) > 0.05;
      })
    : Object.entries(metricGroups);

  // Apply segment + region filters
  const displayMetrics = (segmentFilter === 'all' ? filteredMetrics : filteredMetrics.filter(([, items]) => items[0]?.segment === segmentFilter))
    .filter(([, items]) => regionFilter === 'all' || (items[0]?.region || '').includes(regionFilter));

  // Handlers
  const handleExtract = async () => {
    if (!apiKey) { toast.error('Введите API-ключ'); return; }
    try { await startExtraction(apiKey, period); } catch (e: any) { toast.error(e.message); }
  };
  const handleForecast = async () => {
    if (!apiKey) { toast.error('Введите API-ключ'); return; }
    try { await startForecast(apiKey, period); } catch (e: any) { toast.error(e.message); }
  };
  const handleInterpret = async (metricName: string, value: string, direction: string) => {
    if (!apiKey) { toast.error('Введите API-ключ'); return; }
    setInterpreting(metricName);
    try {
      const r = await fetch('/api/metrics/interpret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, metricName, metricValue: value, direction }),
      });
      const d = await r.json();
      setInterpretations(prev => ({ ...prev, [metricName]: d.interpretation || 'Нет данных' }));
    } catch { /* */ }
    finally { setInterpreting(null); }
  };
  const handleWhatIf = async () => {
    if (!apiKey) { toast.error('Введите API-ключ'); return; }
    setWhatIfLoading(true);
    try {
      const r = await fetch('/api/forecast/whatif', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, adjustments: whatIfSliders }),
      });
      const d = await r.json();
      setWhatIfResult(d.forecast || 'Нет данных');
    } catch (e: any) { toast.error(e.message); }
    finally { setWhatIfLoading(false); }
  };

  // CSV export
  const exportCSV = () => {
    const rows = [['Метрика', 'Значение', 'Ед.изм', 'Тренд', 'Сегмент', 'Регион', 'Достоверность', 'Изменение %']];
    for (const [name, items] of displayMetrics) {
      const latest = getLatestValue(items);
      const prev = getPrevValue(items);
      const change = prev !== 0 ? Math.round((latest - prev) / prev * 100) : 0;
      const item = items.sort((a:any,b:any)=>b.extractedAt?.localeCompare(a.extractedAt||'')||0)[0];
      rows.push([name, String(latest), item?.unit || '', item?.direction || '', segLabels[item?.segment] || item?.segment || '', item?.region || '', Math.round((item?.confidence||0)*100)+'%', change+'%']);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `metrics_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV отчёт скачан');
  };

  // Sparkline loader
  useEffect(() => {
    if (metrics.length === 0) return;
    for (const [name] of Object.entries(metricGroups).slice(0, 10)) {
      fetch(`/api/metrics/${encodeURIComponent(name)}/sparkline?weeks=8`)
        .then(r => r.json()).then(d => setSparklines(prev => ({ ...prev, [name]: d }))).catch(() => {});
    }
  }, [metrics.length]);

  const segLabels: Record<string, string> = {
    'ипотека': 'Ипотека', 'цены': 'Цены', 'спрос': 'Спрос', 'ввод_жилья': 'Ввод жилья',
    'себестоимость': 'Себестоимость', 'регуляторика': 'Регуляторика', 'инвестиции': 'Инвестиции', 'другое': 'Другое',
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* ============ HEADER ============ */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              <BarChart3 className="w-5 h-5" /></div>
            <div><h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Аналитика рынка</h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {total > 0
                  ? `${total} метрик • ${Object.keys(metricGroups).length} показателей`
                  : totalArticles > 0
                    ? `${totalArticles} статей готово к анализу`
                    : 'Нет данных — запустите парсинг'}
              </p></div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODS.map(d => (
              <button key={d} onClick={() => setPeriod(d)} disabled={extracting || forecasting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={period === d ? { background: 'var(--color-primary)', color: 'white' } : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                {PL[d]}</button>))}
            <span className="w-px h-6 mx-1" style={{ background: 'var(--color-border)' }} />
            <button onClick={handleExtract} disabled={extracting} className="btn text-xs font-medium"
              style={{ background: 'var(--color-success)', color: 'white' }}>
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {extracting ? '...' : 'Метрики'}</button>
            <button onClick={handleForecast} disabled={forecasting} className="btn text-xs font-medium"
              style={{ background: 'var(--color-purple)', color: 'white' }}>
              {forecasting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
              {forecasting ? '...' : 'Прогноз'}</button>
          </div>
        </div>
        {(extracting && extractProgress) && <ProgressStrip label="Извлечение метрик" done={extractProgress.done} total={extractProgress.total} current={extractProgress.currentItem} color="var(--color-success)" />}
        {(forecasting && forecastProgress) && (
          <div className="mt-3 animate-slide-down flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader2 className="w-3 h-3 animate-spin" /><span>{forecastProgress.currentItem}</span>
            <span className="flex gap-0.5">{ [0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full"
              style={{ background: i < forecastProgress.done ? 'var(--color-purple)' : 'var(--color-border)' }} />)}</span></div>
        )}
      </div>

      {/* ============ URGENT SIGNALS ============ */}
      {alerts.length > 0 && (
        <div className="card p-4 animate-slide-down" style={{ borderColor: 'var(--color-warning)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>Срочные сигналы</h3>
            <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>{alerts.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(alertsExpanded ? alerts : alerts.slice(0, 4)).map((a, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{
                background: a.severity === 'critical' ? 'var(--color-danger-bg)' : a.severity === 'warning' ? 'var(--color-warning-bg)' : 'var(--color-bg)',
                borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--color-danger)' : a.severity === 'warning' ? 'var(--color-warning)' : 'var(--color-primary)'}`,
              }}>
                {a.direction === 'up' ? <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-success)' }} />
                  : <TrendingDown className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-danger)' }} />}
                <div className="min-w-0">
                  <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{a.metric}: {a.value}</div>
                  {a.relatedNews ? (
                    <a href={a.relatedNews.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs mt-0.5 block hover:underline truncate"
                      style={{ color: 'var(--color-primary)' }}>
                      📰 {a.relatedNews.title.slice(0, 100)}
                      <span className="ml-1 opacity-60">({a.relatedNews.source})</span>
                    </a>
                  ) : (
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                      Нет связанных новостей
                    </div>
                  )}
                </div>
              </div>
            ))}
            {alerts.length > 4 && (
              <button onClick={() => setAlertsExpanded(!alertsExpanded)}
                className="col-span-full text-xs font-medium mt-1 flex items-center gap-1"
                style={{ color: 'var(--color-primary)' }}>
                {alertsExpanded ? <><ChevronUp className="w-3 h-3" /> Свернуть</> : <><ChevronDown className="w-3 h-3" /> Показать все ({alerts.length})</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============ EMPTY STATE ============ */}
      {metrics.length === 0 && !extracting && (
        <div className="card p-6 md:p-8 text-center animate-fade-in">
          <div className="mx-auto mb-5 opacity-30"><BarChart3 className="w-16 h-16" /></div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
            {totalArticles === 0 ? 'Нет данных для анализа' : 'Метрики не извлечены'}
          </h3>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            {totalArticles === 0
              ? 'Сначала нужно собрать новости с помощью парсера. Перейдите на вкладку «Новости» и запустите парсинг.'
              : `В базе ${totalArticles} статей. AI прочитает каждую и извлечёт структурированные метрики: ставки, цены, объёмы ввода, спрос — с единицами измерения и трендами.`}
          </p>
          {totalArticles === 0 ? (
            <button onClick={() => onNavigate?.('news')}
              className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
              <Newspaper className="w-4 h-4" /> Перейти к парсингу
            </button>
          ) : (
            <div className="space-y-4">
              {/* Flow stepper */}
              <div className="flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <span className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                  ✓ {totalArticles} статей</span>
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                <span className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                  2. Извлечь метрики</span>
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                <span className="px-2 py-1 rounded" style={{ color: 'var(--color-text-muted)' }}>3. Прогноз</span>
              </div>
              <button onClick={handleExtract} className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
                <Zap className="w-4 h-4" /> Извлечь метрики из {totalArticles} статей
              </button>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                DeepSeek AI проанализирует каждую статью и выделит: название метрики, значение, единицу измерения, тренд (▲/▼), сегмент рынка и регион.
              </p>
            </div>
          )}
        </div>
      )}

      {metrics.length > 0 && (<>
        {/* Flow stepper (when metrics exist) */}
        {total > 0 && (
          <div className="flex items-center justify-center gap-2 text-xs py-2 animate-fade-in">
            <span className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
              ✓ {totalArticles} статей</span>
            <span style={{ color: 'var(--color-text-muted)' }}>→</span>
            <span className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
              ✓ {total} метрик</span>
            <span style={{ color: 'var(--color-text-muted)' }}>→</span>
            <span className={`px-2 py-1 rounded ${forecast ? '' : ''}`}
              style={{ background: forecast ? 'var(--color-success-bg)' : 'var(--color-bg)', color: forecast ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {forecast ? '✓ Прогноз готов' : '3. Прогноз'}
            </span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Растёт" value={`${total>0?Math.round(counts.up/total*100):0}%`} sub={`${counts.up} метрик`} color="var(--color-success)" />
          <KpiCard icon={<TrendingDown className="w-5 h-5" />} label="Падает" value={`${total>0?Math.round(counts.down/total*100):0}%`} sub={`${counts.down} метрик`} color="var(--color-danger)" />
          <KpiCard icon={<Activity className="w-5 h-5" />} label="Показателей" value={String(Object.keys(metricGroups).length)} sub={`${Object.keys(bySeg).length} сегментов`} color="var(--color-primary)" />
          <KpiCard icon={<Target className="w-5 h-5" />} label="Сигналов" value={String(alerts.length)} sub="требуют внимания" color="var(--color-warning)" />
        </div>

        {/* Segment bars */}
        <div className="card p-4 md:p-5">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>По сегментам</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(bySeg).map(([seg, d]) => {
              const st = d.up + d.down + d.flat;
              return (<div key={seg} className="p-3 rounded-lg" style={{ background: 'var(--color-bg)' }}>
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>{segLabels[seg] || seg}</div>
                <div className="flex items-end gap-1 h-10">
                  {d.up>0 && <div className="flex-1 rounded-t" style={{ height: `${Math.max(8,d.up/st*100)}%`, background: 'var(--color-success)', opacity: .7 }} />}
                  {d.down>0 && <div className="flex-1 rounded-t" style={{ height: `${Math.max(8,d.down/st*100)}%`, background: 'var(--color-danger)', opacity: .7 }} />}
                </div>
                <div className="flex gap-2 mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {d.up>0 && <span style={{ color: 'var(--color-success)' }}>▲{d.up}</span>}
                  {d.down>0 && <span style={{ color: 'var(--color-danger)' }}>▼{d.down}</span>}<span>{st}</span></div>
              </div>);
            })}
          </div>
        </div>

        {/* METRICS TABLE — главный блок */}
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Метрики ({displayMetrics.length}{focusMode && metrics.length !== displayMetrics.length ? ` из ${metrics.length}` : ''})
            </h3>
            <div className="flex items-center gap-3">
              <button onClick={() => setFocusMode(!focusMode)}
                className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: focusMode ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                {focusMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {focusMode ? 'Критические' : 'Все метрики'}
              </button>
              <button onClick={() => { setWhatIfOpen(!whatIfOpen); setWhatIfResult(null); }}
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: whatIfOpen ? 'var(--color-purple)' : 'var(--color-text-muted)' }}>
                <SlidersHorizontal className="w-3.5 h-3.5" /> What-if
              </button>
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--color-text-muted)' }}>
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* Segment + Region filter chips */}
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs mr-1" style={{ color: 'var(--color-text-muted)' }}>Сегмент:</span>
              {[{ key: 'all', label: 'Все' }, ...Object.entries(bySeg).map(([k]) => ({ key: k, label: segLabels[k] || k }))].map(s => (
                <button key={s.key} onClick={() => setSegmentFilter(s.key)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={segmentFilter === s.key
                    ? { background: 'var(--color-primary)', color: 'white' }
                    : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  {s.label}
                  {s.key !== 'all' && <span className="ml-1 opacity-60">({(bySeg[s.key]?.up || 0) + (bySeg[s.key]?.down || 0) + (bySeg[s.key]?.flat || 0)})</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs mr-1" style={{ color: 'var(--color-text-muted)' }}>Регион:</span>
              {[{ key: 'all', label: 'Все' }, ...[...new Set(metrics.map((m: any) => m.region).filter(Boolean))].slice(0, 8).map(r => ({ key: r, label: r }))].map(r => (
                <button key={r.key} onClick={() => setRegionFilter(r.key)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={regionFilter === r.key
                    ? { background: 'var(--color-purple)', color: 'white' }
                    : { background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* What-if panel */}
          {whatIfOpen && (
            <div className="mb-4 p-4 rounded-lg animate-slide-down" style={{ background: 'var(--color-purple-bg)', border: '1px solid var(--color-purple)' }}>
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-purple)' }}>Сценарный анализ: измените параметры</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {Object.entries(metricGroups).slice(0, 8).map(([name, items]) => {
                  const val = getLatestValue(items);
                  return (<div key={name}>
                    <div className="text-xs mb-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{name}</div>
                    <input type="range" min={-50} max={50} value={whatIfSliders[name] || 0}
                      onChange={e => setWhatIfSliders(prev => ({ ...prev, [name]: parseInt(e.target.value) }))}
                      className="w-full h-1.5 rounded appearance-none cursor-pointer"
                      style={{ background: 'var(--color-border)' }} />
                    <div className="text-xs mt-0.5" style={{ color: (whatIfSliders[name]||0)>=0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {(whatIfSliders[name]||0)>=0 ? '+' : ''}{whatIfSliders[name]||0}% (было {val})</div>
                  </div>);
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={handleWhatIf} disabled={whatIfLoading} className="btn text-xs"
                  style={{ background: 'var(--color-purple)', color: 'white' }}>
                  {whatIfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                  Рассчитать сценарий</button>
                <button onClick={() => { setWhatIfSliders({}); setWhatIfResult(null); }}
                  className="btn-ghost text-xs">Сбросить</button>
              </div>
              {whatIfResult && (
                <div className="mt-3 p-4 rounded-lg text-sm" style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-md)',
                }}>
                  <div className="text-xs font-medium mb-2 flex items-center gap-1" style={{ color: 'var(--color-purple)' }}>
                    <Brain className="w-3.5 h-3.5" /> Результат сценария
                  </div>
                  <div style={{ color: 'var(--color-text)' }}>
                    <MarkdownRenderer text={whatIfResult} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="text-left py-2 px-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Метрика</th>
                <th className="text-left py-2 px-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Значение</th>
                <th className="text-center py-2 px-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Тренд</th>
                <th className="text-left py-2 px-2 text-xs font-medium hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>Сегмент</th>
                <th className="text-center py-2 px-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Драйверы</th>
              </tr></thead>
              <tbody>
                {displayMetrics.slice(0, metricsExpanded ? displayMetrics.length : 15).map(([name, items]) => {
                  const latest = getLatestValue(items);
                  const prev = getPrevValue(items);
                  const change = prev !== 0 ? Math.round((latest - prev) / prev * 100) : 0;
                  const direction = items.sort((a:any,b:any)=>b.extractedAt?.localeCompare(a.extractedAt||'')||0)[0]?.direction || 'flat';
                  const spark = sparklines[name];
                  const interp = interpretations[name];

                  return (<Fragment key={name}>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }} className="hover:transition-colors">
                      <td className="py-2 px-2 font-medium" style={{ color: 'var(--color-text)' }}>{name}</td>
                      <td className="py-2 px-2">
                        <span style={{ color: 'var(--color-text-secondary)' }}>{latest}{items[0]?.unit ? <span className="text-xs ml-0.5 opacity-60">{items[0].unit}</span> : ''}</span>
                        {change !== 0 && <span className="ml-1.5 text-xs" style={{ color: change>0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {change>0?'+':''}{change}%</span>}
                        {items[0]?.confidence > 0 && (
                          <span className="ml-1.5 w-2 h-2 rounded-full inline-block"
                            style={{ background: items[0].confidence > 0.7 ? 'var(--color-success)' : items[0].confidence > 0.4 ? 'var(--color-warning)' : 'var(--color-danger)' }}
                            title={`Достоверность: ${Math.round(items[0].confidence * 100)}%`} />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex justify-center" style={{ width: 80, height: 24, margin: '0 auto' }}>
                          <Sparkline data={spark?.sparkline || []} color={direction==='up'?'var(--color-success)':direction==='down'?'var(--color-danger)':'var(--color-text-muted)'} />
                        </div>
                      </td>
                      <td className="py-2 px-2 hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>{segLabels[items[0]?.segment] || items[0]?.segment}</td>
                      <td className="py-2 px-2 text-center">
                        <button onClick={() => interp ? setInterpretations(prev => { const n={...prev}; delete n[name]; return n; }) : handleInterpret(name, String(latest), direction)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all border"
                          style={{
                            color: interp ? 'var(--color-success)' : 'var(--color-primary)',
                            background: interp ? 'var(--color-success-bg)' : 'var(--color-primary-bg)',
                            borderColor: interp ? 'var(--color-success)' : 'var(--color-primary)',
                          }}>
                          {interpreting === name ? <Loader2 className="w-3 h-3 animate-spin" /> : <HelpCircle className="w-3.5 h-3.5" />}
                          {interp ? 'Скрыть' : 'Почему?'}
                        </button>
                      </td>
                    </tr>
                    {interp && (
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td colSpan={5} className="py-2 px-4 animate-slide-down">
                          <div className="text-xs leading-relaxed p-2 rounded" style={{ background: 'var(--color-success-bg)', color: 'var(--color-text-secondary)' }}>
                            <span className="font-medium" style={{ color: 'var(--color-success)' }}>💡 {name}:</span> {interp}</div>
                        </td>
                      </tr>
                    )}
                  </Fragment>);
                })}
              </tbody>
            </table>
            {displayMetrics.length > 15 && !metricsExpanded && (
              <button onClick={() => setMetricsExpanded(true)}
                className="text-xs mt-2 flex items-center gap-1 mx-auto font-medium"
                style={{ color: 'var(--color-primary)' }}>
                <ChevronDown className="w-3.5 h-3.5" /> Показать все ({displayMetrics.length})
              </button>
            )}
            {metricsExpanded && displayMetrics.length > 15 && (
              <button onClick={() => setMetricsExpanded(false)}
                className="text-xs mt-2 flex items-center gap-1 mx-auto font-medium"
                style={{ color: 'var(--color-text-muted)' }}>
                <ChevronUp className="w-3.5 h-3.5" /> Свернуть
              </button>
            )}
          </div>
        </div>
      </>)}

      {/* Forecast */}
      {forecast && (
        <div className="card p-4 md:p-5 animate-slide-up" style={{ borderColor: 'var(--color-purple)', background: 'var(--color-purple-bg)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Brain className="w-5 h-5" style={{ color: 'var(--color-purple)' }} />
              <h3 className="font-semibold" style={{ color: 'var(--color-purple)' }}>AI-Прогноз на неделю</h3></div>
            <button onClick={() => setForecast(null)} className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>скрыть</button></div>
          <MarkdownRenderer text={forecast} /></div>
      )}
    </div>
  );
}

// ============== Sub-components ==============

function Sparkline({ data, color }: { data: { week: string; value: number }[]; color: string }) {
  if (!data || data.length < 2) return <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>—</div>;
  const w = 80, h = 24, pad = 2;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const points = vals.map((v, i) => `${(i/(vals.length-1))*(w-2*pad)+pad},${h-pad-((v-min)/range)*(h-2*pad)}`).join(' ');
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(vals.length-1)/(vals.length-1)*(w-2*pad)+pad} cy={h-pad-((vals[vals.length-1]-min)/range)*(h-2*pad)} r={2} fill={color} />
    </svg>
  );
}

function ProgressStrip({ label, done, total, current, color }: { label: string; done: number; total: number; current: string; color: string }) {
  if (total === 0) return null;
  return (
    <div className="mt-3 animate-slide-down">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span style={{ color: 'var(--color-text-secondary)' }}><Loader2 className="w-3 h-3 inline animate-spin mr-1" />{label}: {done}/{total}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{Math.round((done/total)*100)}%</span></div>
      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${Math.round((done/total)*100)}%`, background: color }} /></div>
      <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-text-muted)' }}>{current}</p></div>
  );
}

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card p-3 md:p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color+'18', color }}>{icon}</div>
      <div className="min-w-0"><div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
        <div className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{value}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{sub}</div></div>
    </div>
  );
}
