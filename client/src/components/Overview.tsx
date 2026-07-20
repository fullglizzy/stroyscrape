import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, Bell, Target, Newspaper, Zap, Brain, ChevronRight, BarChart3 } from 'lucide-react';
import { SourceStats } from '../api';

interface Props {
  sources: SourceStats;
  metrics: any[];
  forecast: string | null;
  onNavigate: (section: string) => void;
  onExtract: () => void;
}

export default function Overview({ sources, metrics, forecast, onNavigate, onExtract }: Props) {
  const totalArticles = Object.values(sources).reduce((s, info) => s + info.count, 0);
  const hasArticles = totalArticles > 0;
  const hasMetrics = metrics.length > 0;
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/alerts').then(r => r.json()).then(d => setAlerts(d.alerts || [])).catch(() => {});
  }, []);

  // KPI stats (when metrics exist)
  const counts = { up: 0, down: 0, flat: 0 };
  if (hasMetrics) {
    for (const m of metrics) {
      if (m.direction === 'up') counts.up++;
      else if (m.direction === 'down') counts.down++;
      else counts.flat++;
    }
  }
  const total = metrics.length;

  // Unique metric names
  const uniqueNames = new Set(metrics.map((m: any) => m.metricName)).size;
  const segments = new Set(metrics.map((m: any) => m.segment)).size;

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* ---------- Onboarding / Welcome ---------- */}
      {!hasArticles && (
        <div className="card p-6 md:p-8 text-center">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
            <Newspaper className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>Добро пожаловать!</h2>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            СтройПарсер — аналитическая платформа для мониторинга строительного рынка России.
            AI собирает новости из 9 источников, извлекает метрики и строит прогнозы.
          </p>
          <div className="space-y-3 max-w-sm mx-auto">
            <StepCard step={1} title="Запустите парсинг" done={false}
              description="Соберите свежие новости строительной отрасли"
              action="Перейти к парсеру" onAction={() => onNavigate('scraper')} />
            <StepCard step={2} title="Извлеките метрики" done={false}
              description="AI найдёт в новостях ставки, цены и другие показатели"
              disabled />
            <StepCard step={3} title="Получите прогноз" done={false}
              description="AI предскажет динамику рынка на неделю"
              disabled />
          </div>
        </div>
      )}

      {/* ---------- Has articles but no metrics ---------- */}
      {hasArticles && !hasMetrics && (
        <div className="card p-6 md:p-8 text-center">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
            <Newspaper className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            ✓ {totalArticles} статей собрано
          </h2>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            Отлично! Теперь AI может прочитать эти статьи и извлечь структурированные метрики.
          </p>
          <div className="space-y-3 max-w-sm mx-auto">
            <StepCard step={1} title="Новости собраны" done
              description={`${totalArticles} статей из ${Object.keys(sources).length} источников`} />
            <StepCard step={2} title="Извлеките метрики" done={false}
              description="AI прочитает статьи и найдёт показатели рынка"
              action="Извлечь метрики" onAction={onExtract} />
            <StepCard step={3} title="Прогноз" done={false}
              description="AI предскажет динамику на неделю"
              disabled />
          </div>
        </div>
      )}

      {/* ---------- Has metrics — show dashboard ---------- */}
      {hasMetrics && (
        <>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Обзор рынка</h2>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
            <MiniKpi icon={<TrendingUp className="w-4 h-4" />} label="Растёт" value={`${Math.round(counts.up / total * 100)}%`} color="var(--color-success)" />
            <MiniKpi icon={<TrendingDown className="w-4 h-4" />} label="Падает" value={`${Math.round(counts.down / total * 100)}%`} color="var(--color-danger)" />
            <MiniKpi icon={<Activity className="w-4 h-4" />} label="Стабильно" value={`${Math.round(counts.flat / total * 100)}%`} color="var(--color-text-muted)" />
            <MiniKpi icon={<Target className="w-4 h-4" />} label="Показателей" value={String(uniqueNames)} color="var(--color-primary)" />
            <MiniKpi icon={<Bell className="w-4 h-4" />} label="Сигналов" value={String(alerts.length)} color="var(--color-warning)" />
          </div>

          {/* Status line */}
          <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
            <span>📰 {totalArticles} статей</span>
            <span>📊 {total} метрик</span>
            <span>📂 {segments} сегментов</span>
            {forecast && <span style={{ color: 'var(--color-success)' }}>🔮 Прогноз готов</span>}
          </div>

          {/* Alerts preview — loaded from API */}
          <AlertsPreview alerts={alerts} onNavigate={onNavigate} />

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <QuickAction icon={<Newspaper className="w-5 h-5" />} label="Новости" desc={`${totalArticles} статей`}
              color="var(--color-primary)" onClick={() => onNavigate('news')} />
            <QuickAction icon={<BarChart3 className="w-5 h-5" />} label="Аналитика" desc={`${uniqueNames} показателей`}
              color="var(--color-success)" onClick={() => onNavigate('analytics')} />
            <QuickAction icon={<Brain className="w-5 h-5" />} label="Прогноз" desc={forecast ? 'Готов' : 'Сгенерировать'}
              color="var(--color-purple)" onClick={() => onNavigate('analytics')} />
          </div>
        </>
      )}
    </div>
  );
}

// ============== Sub-components ==============

function StepCard({ step, title, description, done, action, onAction, disabled }: {
  step: number; title: string; description: string; done: boolean;
  action?: string; onAction?: () => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg text-left"
      style={{ background: done ? 'var(--color-success-bg)' : 'var(--color-bg)' }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
        style={done
          ? { background: 'var(--color-success)', color: 'white' }
          : { background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
        {done ? '✓' : step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: done ? 'var(--color-success)' : 'var(--color-text)' }}>{title}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{description}</div>
        {action && onAction && (
          <button onClick={onAction} className="text-xs font-medium mt-1.5 flex items-center gap-1"
            style={{ color: 'var(--color-primary)' }}>
            {action} <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function MiniKpi({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: color + '18', color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
        <div className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{value}</div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, desc, color, onClick }: {
  icon: React.ReactNode; label: string; desc: string; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="card p-4 flex items-center gap-3 text-left transition-all hover:shadow-md">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '18', color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{desc}</div>
      </div>
      <ChevronRight className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
    </button>
  );
}

function AlertsPreview({ alerts, onNavigate }: { alerts: any[]; onNavigate: (s: string) => void }) {
  if (alerts.length === 0) return null;

  return (
    <div className="card p-4" style={{ borderColor: 'var(--color-warning)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Bell className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
          Срочные сигналы ({alerts.length})
        </h3>
        <button onClick={() => onNavigate('analytics')}
          className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
          Все <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {alerts.slice(0, 4).map((a: any, i: number) => (
          <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{
            background: a.severity === 'critical' ? 'var(--color-danger-bg)' : a.severity === 'warning' ? 'var(--color-warning-bg)' : 'var(--color-bg)',
            borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--color-danger)' : a.severity === 'warning' ? 'var(--color-warning)' : 'var(--color-primary)'}`,
          }}>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{a.metric}: {a.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
