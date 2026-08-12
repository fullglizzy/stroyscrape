import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Trash2, Loader2,
  AlertTriangle, ChevronDown, ChevronUp, Calendar,
  Zap, Cpu, Database, Newspaper, Skull,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from '../ToastContext';

interface Report {
  id: number;
  domain: 'energy' | 'digital' | 'datacenters';
  title: string;
  content: string;
  periodStart?: string;
  periodEnd?: string;
  articleCount: number;
  createdAt?: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  energy: 'Энергетика',
  digital: 'Цифровизация',
  datacenters: 'Рынок ЦОДов',
};

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  energy: <Zap className="w-4 h-4" />,
  digital: <Cpu className="w-4 h-4" />,
  datacenters: <Database className="w-4 h-4" />,
};

const DOMAIN_COLORS: Record<string, string> = {
  energy: '#f59e0b',
  digital: '#6366f1',
  datacenters: '#06b6d4',
};

/** Готовые пресеты периодов */
const PERIOD_PRESETS: { label: string; days: number }[] = [
  { label: '7 дн.', days: 7 },
  { label: '14 дн.', days: 14 },
  { label: '30 дн.', days: 30 },
  { label: '90 дн.', days: 90 },
];

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ReportsManager() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [domainFilter, setDomainFilter] = useState<string>('');
  const toast = useToast();

  // ---- Article deletion state ----
  const [artFrom, setArtFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return fmtDate(d);
  });
  const [artTo, setArtTo] = useState(() => fmtDate(new Date()));
  const [artDeleting, setArtDeleting] = useState(false);
  const [artConfirm, setArtConfirm] = useState(false);
  const [artResult, setArtResult] = useState<{ deleted: number; sourceBreakdown: Record<string, number> } | null>(null);

  // ---- Delete ALL articles state ----
  const [artAllConfirm, setArtAllConfirm] = useState(false);
  const [artAllDeleting, setArtAllDeleting] = useState(false);

  // ---- Reports loading ----
  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      if (domainFilter) qs.set('domain', domainFilter);
      qs.set('limit', '50');
      const res = await fetch(`/api/reports?${qs.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
      const data = await res.json();
      setReports(data.reports);
      setTotal(data.total);
    } catch (err: any) {
      toast.error(err.message || 'Ошибка загрузки отчётов');
    } finally {
      setLoading(false);
    }
  }, [domainFilter]); // eslint-disable-line

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
      const data = await res.json();
      setReports(prev => prev.filter(r => r.id !== id));
      setTotal(prev => prev - 1);
      if (expandedId === id) setExpandedId(null);
      if (deleteConfirm === id) setDeleteConfirm(null);
      toast.success(data.message || 'Отчёт удалён');
    } catch (err: any) {
      toast.error(err.message || 'Ошибка удаления');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId(prev => prev === id ? null : id);
    setDeleteConfirm(null);
  };

  const formatDate = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ---- Article deletion ----
  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setArtFrom(fmtDate(from));
    setArtTo(fmtDate(to));
    setArtConfirm(false);
    setArtResult(null);
  };

  const handleDeleteArticles = async () => {
    setArtDeleting(true);
    setArtResult(null);
    try {
      const res = await fetch(`/api/articles?from=${artFrom}&to=${artTo}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
      const data = await res.json();
      setArtResult(data);
      setArtConfirm(false);
      toast.success(data.message || `Удалено ${data.deleted} статей`);
    } catch (err: any) {
      toast.error(err.message || 'Ошибка удаления статей');
    } finally {
      setArtDeleting(false);
    }
  };

  const handleDeleteAllArticles = async () => {
    setArtAllDeleting(true);
    setArtResult(null);
    try {
      const res = await fetch('/api/articles/all', { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
      const data = await res.json();
      setArtResult(data);
      setArtAllConfirm(false);
      toast.success(data.message || `Удалено ${data.deleted} статей`);
    } catch (err: any) {
      toast.error(err.message || 'Ошибка удаления статей');
    } finally {
      setArtAllDeleting(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* ===== Article Deletion Card ===== */}
      <div className="card p-4 md:p-5" style={{ borderColor: 'var(--color-warning)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Удаление статей по дате</h2>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Presets */}
          <div className="flex gap-1">
            {PERIOD_PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>с</span>
            <input
              type="date"
              value={artFrom}
              onChange={e => { setArtFrom(e.target.value); setArtConfirm(false); setArtResult(null); }}
              className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>по</span>
            <input
              type="date"
              value={artTo}
              onChange={e => { setArtTo(e.target.value); setArtConfirm(false); setArtResult(null); }}
              className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>

          {/* Delete button / confirm */}
          {artConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDeleteArticles}
                disabled={artDeleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'var(--color-danger)', color: 'white' }}
              >
                {artDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Подтверждаю'}
              </button>
              <button
                onClick={() => setArtConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => setArtConfirm(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Удалить статьи
            </button>
          )}
        </div>

        {/* Divider + Delete ALL */}
        <div className="mt-3 pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid var(--color-border)' }}>
          {artAllConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDeleteAllArticles}
                disabled={artAllDeleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                style={{ background: 'var(--color-danger)', color: 'white' }}
              >
                {artAllDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Skull className="w-3.5 h-3.5" />}
                Удалить ВСЕ статьи
              </button>
              <button
                onClick={() => setArtAllConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setArtAllConfirm(true); setArtConfirm(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
            >
              <Skull className="w-3.5 h-3.5" />
              Удалить ВСЕ статьи
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Безвозвратно удаляет все новости из базы
          </span>
        </div>

        {/* Result */}
        {artResult && (
          <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'var(--color-bg)' }}>
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>
              Удалено {artResult.deleted} статей
            </span>
            {Object.keys(artResult.sourceBreakdown).length > 0 && (
              <div className="mt-1.5 flex gap-2 flex-wrap">
                {Object.entries(artResult.sourceBreakdown).map(([src, cnt]) => (
                  <span key={src} className="badge text-xs"
                    style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                    {src}: {cnt}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== Reports Header ===== */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Управление отчётами</h2>
            <span className="badge text-xs" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
              {total}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Domain filter */}
            <select
              value={domainFilter}
              onChange={e => { setDomainFilter(e.target.value); setExpandedId(null); }}
              className="text-xs px-3 py-1.5 rounded-lg outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              <option value="">Все домены</option>
              <option value="energy">Энергетика</option>
              <option value="digital">Цифровизация</option>
              <option value="datacenters">Рынок ЦОДов</option>
            </select>
            <button
              onClick={loadReports}
              disabled={loading}
              className="btn-ghost text-xs"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Обновить'}
            </button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && reports.length === 0 && (
        <div className="card p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Загрузка отчётов...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && reports.length === 0 && (
        <div className="card p-8 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Нет сохранённых отчётов</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {domainFilter ? `Нет отчётов по домену «${DOMAIN_LABELS[domainFilter]}»` : 'Сгенерируйте первый отчёт во вкладке «Аналитика»'}
          </p>
        </div>
      )}

      {/* Reports list */}
      {reports.map(report => {
        const isExpanded = expandedId === report.id;
        const isConfirming = deleteConfirm === report.id;
        const isDeleting = deletingId === report.id;
        const domainColor = DOMAIN_COLORS[report.domain] || 'var(--color-text-muted)';

        return (
          <div key={report.id} className="card overflow-hidden animate-slide-up"
            style={{ borderColor: isExpanded ? domainColor : 'var(--color-border)' }}>
            {/* Report header */}
            <div className="flex items-start gap-3 p-4">
              <button
                onClick={() => toggleExpand(report.id)}
                className="flex-1 flex items-start gap-3 text-left min-w-0"
              >
                <div className="mt-0.5 flex-shrink-0" style={{ color: domainColor }}>
                  {DOMAIN_ICONS[report.domain]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="badge text-xs font-medium"
                      style={{ background: `${domainColor}18`, color: domainColor }}>
                      {DOMAIN_LABELS[report.domain]}
                    </span>
                    <span className="badge text-xs" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                      {report.articleCount} ст.
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
                    {report.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(report.createdAt)}
                    </span>
                    {report.periodStart && report.periodEnd && (
                      <span>
                        {report.periodStart} → {report.periodEnd}
                      </span>
                    )}
                    <span>#{report.id}</span>
                  </div>
                  {/* Preview when collapsed */}
                  {!isExpanded && (
                    <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {report.content.replace(/[#*\[\]()]/g, '').slice(0, 200)}...
                    </p>
                  )}
                </div>
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />}
              </button>

              {/* Delete button */}
              <div className="flex-shrink-0">
                {isConfirming ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(report.id)}
                      disabled={isDeleting}
                      className="px-2 py-1 rounded text-xs font-medium transition-colors"
                      style={{ background: 'var(--color-danger)', color: 'white' }}
                    >
                      {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Удалить'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(report.id)}
                    className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                    style={{ color: 'var(--color-text-muted)' }}
                    title="Удалить отчёт"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-0" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="pt-4 text-sm">
                  <MarkdownRenderer text={report.content} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
