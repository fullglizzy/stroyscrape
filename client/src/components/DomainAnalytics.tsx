import { useState, useEffect, useRef } from 'react';
import {
  Zap, Cpu, Building2, Loader2, ChevronDown, ChevronUp, Clock, FileText,
  Newspaper, AlertTriangle, TrendingUp, Lightbulb,
  Ban, Target, Wrench, CheckCircle2, RefreshCw,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useToast } from '../ToastContext';
import InfoTip from './InfoTip';

interface Props {
  sources: Record<string, { name: string; count: number; lastArticle: string | null }>;
  onNavigate?: (tab: string) => void;
}

type Domain = 'energy' | 'digital' | 'datacenters';

interface Report {
  id: number;
  domain: string;
  title: string;
  content: string;
  periodStart: string;
  periodEnd: string;
  previousReportId: number | null;
  articleCount: number;
  createdAt: string;
}

interface JobProgress {
  id: string;
  type: string;
  domain: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  currentItem: string;
  error?: string;
  result?: string;
}

const DEFAULT_DAYS = 7;

interface DomainMeta {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  description: string;
}

const domains: Record<Domain, DomainMeta> = {
  energy: {
    label: 'Энергетика',
    shortLabel: 'Энергия',
    icon: <Zap className="w-4 h-4" />,
    description: 'Аналитика по энергетической инфраструктуре в строительстве: новые программы, финансирование, планы, замороженные проекты',
  },
  digital: {
    label: 'Цифровизация',
    shortLabel: 'Цифра',
    icon: <Cpu className="w-4 h-4" />,
    description: 'Аналитика цифровизации стройотрасли: ТИМ/BIM, ИИ, импортозамещение, новые технологии, регуляторика',
  },
  datacenters: {
    label: 'Рынок ЦОДов',
    shortLabel: 'ЦОДы',
    icon: <Building2 className="w-4 h-4" />,
    description: 'Аналитика рынка ЦОД и IT-инфраструктуры: тренды, дефициты, барьеры, новые проекты',
  },
};

const sectionIcons: Record<string, React.ReactNode> = {
  'Ключевые': <Newspaper className="w-4 h-4" />,
  'Новые': <Zap className="w-4 h-4" />,
  'Финансирование': <TrendingUp className="w-4 h-4" />,
  'Планы': <Target className="w-4 h-4" />,
  'Замороженные': <Ban className="w-4 h-4" />,
  'Что': <Lightbulb className="w-4 h-4" />,
  'Выводы': <Lightbulb className="w-4 h-4" />,
  'Куда': <TrendingUp className="w-4 h-4" />,
  'Текущая': <Building2 className="w-4 h-4" />,
  'Чего': <Wrench className="w-4 h-4" />,
  'Источники': <Newspaper className="w-4 h-4" />,
  'Регуляторика': <FileText className="w-4 h-4" />,
  'Импортозамещение': <TrendingUp className="w-4 h-4" />,
};

function getSectionIcon(title: string): React.ReactNode {
  const firstWord = title.split(' ')[0];
  return sectionIcons[firstWord] || <FileText className="w-4 h-4" />;
}

function getSectionColor(title: string): string {
  if (title.includes('изменилось')) return 'var(--color-purple)';
  if (title.includes('Выводы')) return 'var(--color-success)';
  if (title.includes('Замороженные') || title.includes('мешает') || title.includes('не хватает')) return 'var(--color-danger)';
  if (title.includes('Ключевые') || title.includes('Финансирование')) return 'var(--color-warning)';
  if (title.includes('Планы')) return 'var(--color-primary)';
  if (title.includes('Новые') || title.includes('Куда')) return 'var(--color-success)';
  return 'var(--color-text-secondary)';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function DomainAnalytics({ sources, onNavigate }: Props) {
  const [domain, setDomain] = useState<Domain>('energy');
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relevance, setRelevance] = useState<{ totalArticles: number; relevantCount: number; hasData: boolean } | null>(null);

  const toast = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const totalArticles = Object.values(sources).reduce((s, info) => s + info.count, 0);
  const todayReport = report && report.createdAt && isToday(report.createdAt);

  // Таймер до следующего отчёта
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    if (!todayReport) { setTimeLeft(''); return; }
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      if (diff <= 0) { setTimeLeft('скоро'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(`${h} ч ${m} мин`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [todayReport]);

  useEffect(() => {
    loadLatestReport();
    loadHistory();
    checkRelevance();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [domain]);

  const loadLatestReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/analytics/reports/${domain}/latest`);
      const d = await r.json();
      setReport(d.report || null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    try {
      const r = await fetch(`/api/analytics/reports/${domain}`);
      const d = await r.json();
      setHistory(d.reports || []);
    } catch { /* ignore */ }
  };

  const checkRelevance = async () => {
    try {
      const r = await fetch(`/api/analytics/relevance/${domain}?days=${DEFAULT_DAYS}`);
      const d = await r.json();
      setRelevance(d);
    } catch { /* ignore */ }
  };

  const handleGenerate = async () => {
    if (todayReport) return;
    setGenerating(true);
    setProgress(null);
    setError(null);
    try {
      const res = await fetch('/api/analytics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, daysBack: DEFAULT_DAYS }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.jobId) {
        if (data.message) setError(data.message);
        setGenerating(false);
        return;
      }

      pollRef.current = setInterval(async () => {
        try {
          const sRes = await fetch(`/api/analytics/status?jobId=${data.jobId}`);
          const sData = await sRes.json();
          const job = sData.job;
          if (job) {
            setProgress(job);
            if (job.status === 'done') {
              clearInterval(pollRef.current);
              setGenerating(false);
              setReport({ id: 0, domain, title: '', content: job.result || '', periodStart: '', periodEnd: '', previousReportId: null, articleCount: 0, createdAt: new Date().toISOString() });
              toast.success('Отчёт сгенерирован');
              loadLatestReport();
              loadHistory();
            }
            if (job.status === 'error') {
              clearInterval(pollRef.current);
              setGenerating(false);
              setError(job.error || 'Ошибка генерации');
              toast.error(job.error || 'Ошибка генерации');
            }
          }
        } catch { /* poll error */ }
      }, 800);
    } catch (err: any) {
      setGenerating(false);
      setError(err.message);
      toast.error(err.message);
    }
  };

  const parseSections = (content: string): { title: string; body: string }[] => {
    if (!content) return [];
    const sections: { title: string; body: string }[] = [];
    const parts = content.split(/^## /gm);
    for (const part of parts) {
      if (!part.trim()) continue;
      const newlineIdx = part.indexOf('\n');
      const title = newlineIdx > 0 ? part.slice(0, newlineIdx).trim() : part.trim();
      const body = newlineIdx > 0 ? part.slice(newlineIdx + 1).trim() : '';
      sections.push({ title, body });
    }
    return sections;
  };

  const sections = report ? parseSections(report.content) : [];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* ======== Header ======== */}
      <div className="card p-4 md:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              {domains[domain].icon}
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                Аналитика рынка
                <InfoTip title="Доменная аналитика">
                  AI анализирует новости по трём направлениям: энергетика, рынок ЦОД и цифровизация стройки.
                  Отчёт генерируется раз в день на основе свежих новостей за 7 дней.
                </InfoTip>
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {report
                  ? `Отчёт от ${formatDate(report.createdAt)} • ${report.articleCount} статей`
                  : totalArticles > 0
                    ? `${totalArticles} статей в базе — сгенерируйте отчёт`
                    : 'Нет данных — запустите парсинг'}
              </p>
            </div>
          </div>

          {/* Generate button */}
          {!todayReport && (
            <button onClick={handleGenerate} disabled={generating || totalArticles === 0}
              className="btn text-xs font-medium flex items-center gap-1.5"
              style={{ background: 'var(--color-success)', color: 'white', opacity: (generating || totalArticles === 0) ? 0.6 : 1 }}>
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {generating ? 'Генерация...' : 'Сгенерировать отчёт'}
            </button>
          )}
          {todayReport && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Отчёт за сегодня готов
              </span>
              {timeLeft && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Следующий через {timeLeft}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Domain tabs */}
        <div className="flex gap-1.5 sm:gap-2 mt-4">
          {(Object.keys(domains) as Domain[]).map(d => (
            <button
              key={d}
              onClick={() => { setDomain(d); setReport(null); }}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all border-2 ${
                domain === d ? 'border-[var(--color-primary)]' : 'border-transparent'
              }`}
              style={{
                color: domain === d ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                background: domain === d ? 'var(--color-primary-bg)' : 'var(--color-bg)',
              }}
            >
              {domains[d].icon}
              <span className="hidden sm:inline">{domains[d].label}</span>
              <span className="sm:hidden">{domains[d].shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Progress bar */}
        {generating && progress && (
          <div className="mt-3 animate-slide-down">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span style={{ color: 'var(--color-text-secondary)' }}>
                <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                {progress.currentItem || 'Генерация...'}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{progress.done}/{progress.total}</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, background: 'var(--color-success)' }} />
            </div>
          </div>
        )}
      </div>

      {/* ======== Empty / Error states ======== */}
      {!report && !generating && !loading && (
        <div className="card p-6 md:p-8 text-center animate-fade-in">
          {totalArticles === 0 ? (
            <>
              <div className="flex justify-center mb-5 opacity-30"><Newspaper className="w-16 h-16" /></div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Нет данных для анализа</h3>
              <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                Сначала нужно собрать новости с помощью парсера.
              </p>
              <button onClick={() => onNavigate?.('news')}
                className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
                <Newspaper className="w-4 h-4" /> Перейти к парсингу
              </button>
            </>
          ) : error ? (
            <>
              <div className="flex justify-center mb-5 opacity-30"><AlertTriangle className="w-16 h-16" /></div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>{error}</h3>
              <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                {error.includes('Нет статей по тематике')
                  ? 'Попробуйте позже — дождитесь новых новостей.'
                  : 'Попробуйте снова или проверьте API-ключ DeepSeek.'}
              </p>
              {!todayReport && (
                <button onClick={handleGenerate}
                  className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
                  <RefreshCw className="w-4 h-4" /> Попробовать снова
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-center mb-5 opacity-30">
                {domains[domain].icon}
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                {domains[domain].label}: отчёт не сгенерирован
              </h3>
              <p className="text-sm mb-2 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                {domains[domain].description}
              </p>
              {relevance && (
                <p className="text-xs mb-4" style={{ color: relevance.hasData ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {relevance.hasData
                    ? `✅ Найдено ${relevance.relevantCount} релевантных статей из ${relevance.totalArticles}`
                    : `⚠️ Нет релевантных статей (всего в базе: ${relevance.totalArticles})`}
                </p>
              )}
              {(!relevance || relevance.hasData) && (
                <button onClick={handleGenerate}
                  className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
                  <RefreshCw className="w-4 h-4" /> Сгенерировать отчёт
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ======== Loading ======== */}
      {loading && !report && (
        <div className="card p-6 text-center animate-fade-in">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Загрузка отчёта...</p>
        </div>
      )}

      {/* ======== Report display ======== */}
      {report && sections.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          {sections.map((section, idx) => {
            const isChanges = section.title.includes('изменилось');
            const color = getSectionColor(section.title);
            return (
              <div
                key={idx}
                className="card p-4 md:p-5"
                style={isChanges ? {
                  borderColor: 'var(--color-purple)',
                  background: 'var(--color-purple-bg)',
                  boxShadow: '0 0 0 1px var(--color-purple)',
                } : {}}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color }}>{getSectionIcon(section.title)}</span>
                  <h3 className="text-sm font-semibold" style={{ color: isChanges ? 'var(--color-purple)' : 'var(--color-text)' }}>
                    {section.title}
                  </h3>
                  {isChanges && (
                    <span className="badge text-xs" style={{ background: 'var(--color-purple)', color: 'white' }}>
                      обновление
                    </span>
                  )}
                </div>
                <div style={{ color: 'var(--color-text-secondary)' }}>
                  <MarkdownRenderer text={section.body} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======== History ======== */}
      {history.length > 0 && (
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                История отчётов
                <InfoTip title="История">
                  Предыдущие отчёты сохранены в базе. Каждый новый отчёт ссылается на предыдущий — AI учитывает историю при генерации.
                </InfoTip>
              </h3>
              <span className="badge" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>{history.length}</span>
            </div>
          </div>
          <div className="space-y-2">
            {(historyExpanded ? history : history.slice(0, 5)).map((r) => (
              <details key={r.id} className="group">
                <summary className="flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm"
                  style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                  <span className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{r.title}</span>
                  <span className="text-xs opacity-60 whitespace-nowrap">{formatDate(r.createdAt)}</span>
                  <span className="text-xs opacity-50">({r.articleCount} ст.)</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-auto flex-shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="mt-2 p-3 rounded-lg text-sm" style={{ background: 'var(--color-bg)' }}>
                  <MarkdownRenderer text={r.content} />
                </div>
              </details>
            ))}
          </div>
          {history.length > 5 && (
            <button onClick={() => setHistoryExpanded(!historyExpanded)}
              className="text-xs mt-2 flex items-center gap-1 mx-auto font-medium"
              style={{ color: 'var(--color-primary)' }}>
              {historyExpanded ? <><ChevronUp className="w-3 h-3" /> Свернуть</> : <><ChevronDown className="w-3 h-3" /> Показать все ({history.length})</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
