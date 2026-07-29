import { Newspaper, BarChart3, Zap, Cpu, Building2, ChevronRight } from 'lucide-react';
import { SourceStats } from '../api';

interface Props {
  sources: SourceStats;
  onNavigate: (section: string) => void;
}

export default function Overview({ sources, onNavigate }: Props) {
  const totalArticles = Object.values(sources).reduce((s, info) => s + info.count, 0);
  const activeSources = Object.values(sources).filter(s => s.count > 0).length;
  const hasArticles = totalArticles > 0;

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
            AI собирает новости из 12 источников и строит доменную аналитику по энергетике, рынку ЦОД и цифровизации стройки.
          </p>
          <div className="space-y-3 max-w-sm mx-auto">
            <StepCard step={1} title="Запустите парсинг" done={false}
              description="Соберите свежие новости строительной отрасли"
              action="Перейти к парсеру" onAction={() => onNavigate('scraper')} />
            <StepCard step={2} title="Сгенерируйте аналитику" done={false}
              description="AI проанализирует новости по энергетике и цифровизации"
              disabled />
          </div>
        </div>
      )}

      {/* ---------- Has articles — show dashboard ---------- */}
      {hasArticles && (
        <>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Обзор</h2>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <MiniKpi icon={<Newspaper className="w-4 h-4" />} label="Статей" value={String(totalArticles)} color="var(--color-primary)" />
            <MiniKpi icon={<BarChart3 className="w-4 h-4" />} label="Источников" value={String(activeSources)} color="var(--color-success)" />
          </div>

          {/* Status line */}
          <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
            <span>📰 {totalArticles} статей в базе</span>
            <span>📡 {activeSources} активных источников</span>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <QuickAction icon={<Newspaper className="w-5 h-5" />} label="Новости" desc={`${totalArticles} статей`}
              color="var(--color-primary)" onClick={() => onNavigate('news')} />
            <QuickAction icon={<Zap className="w-5 h-5" />} label="Энергетика" desc="Инфраструктура"
              color="var(--color-warning)" onClick={() => onNavigate('analytics')} />
            <QuickAction icon={<Building2 className="w-5 h-5" />} label="Рынок ЦОДов" desc="Дата-центры"
              color="var(--color-purple)" onClick={() => onNavigate('analytics')} />
            <QuickAction icon={<Cpu className="w-5 h-5" />} label="Цифровизация" desc="IT в стройке"
              color="var(--color-success)" onClick={() => onNavigate('analytics')} />
          </div>

          {/* Sources preview */}
          <div className="card p-4 md:p-5">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Источники</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(sources)
                .filter(([, info]) => info.count > 0)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([id, info]) => (
                  <div key={id} className="flex items-center justify-between p-2 rounded-lg text-xs"
                    style={{ background: 'var(--color-bg)' }}>
                    <span className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{info.name}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{info.count} ст.</span>
                  </div>
                ))}
            </div>
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
