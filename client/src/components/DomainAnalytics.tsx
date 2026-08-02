import { useState, useEffect } from 'react';
import {
  Zap, Cpu, Building2, Loader2, ChevronDown, ChevronUp, Clock, FileText,
  Newspaper, TrendingUp, Lightbulb, Ban, Target, Wrench, CheckCircle2, Copy,
  RefreshCw,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import InfoTip from './InfoTip';
import { useToast } from '../ToastContext';

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
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const totalArticles = Object.values(sources).reduce((s, info) => s + info.count, 0);
  const todayReport = report && report.createdAt && isToday(report.createdAt);

  useEffect(() => {
    loadLatestReport();
    loadHistory();
  }, [domain]);

  const loadLatestReport = async () => {
    setLoading(true);
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

  const generateReport = async () => {
    setGenerating(true);
    try {
      const r = await fetch('/api/analytics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, daysBack: 7 }),
      });
      const d = await r.json();
      if (!d.jobId) {
        toast.toast('info', d.message || 'Генерация запущена');
        setGenerating(false);
        return;
      }
      // Poll job status
      for (let i = 0; i < 60; i++) {
        await new Promise(res => setTimeout(res, 3000));
        const statusR = await fetch(`/api/analytics/status?jobId=${encodeURIComponent(d.jobId)}`);
        const statusD = await statusR.json();
        const job = statusD.job;
        if (!job || job.status === 'done') {
          toast.success('Отчёт готов!');
          break;
        }
        if (job.status === 'error') {
          toast.error(job.error || 'Ошибка генерации');
          break;
        }
      }
      await loadLatestReport();
      await loadHistory();
    } catch (e: any) {
      toast.error(e.message || 'Не удалось запустить генерацию');
    } finally {
      setGenerating(false);
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

  const handleCopy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.content);
      setCopied(true);
      toast.success('Отчёт скопирован');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

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
                  Отчёты генерируются автоматически каждый день в 8:00 МСК на основе свежих новостей за 7 дней.
                </InfoTip>
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {report
                  ? `Отчёт от ${formatDate(report.createdAt)} • ${report.articleCount} статей`
                  : totalArticles > 0
                    ? 'Отчёт будет сгенерирован автоматически в 8:00 МСК'
                    : 'Нет данных — запустите парсинг'}
              </p>
            </div>
          </div>

          {todayReport && (
            <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Отчёт за сегодня готов
            </span>
          )}
          {!todayReport && totalArticles > 0 && (
            <button onClick={generateReport} disabled={generating}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: generating ? 'var(--color-bg)' : 'var(--color-primary)',
                color: generating ? 'var(--color-text-muted)' : 'white',
                cursor: generating ? 'not-allowed' : 'pointer',
              }}>
              {generating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Генерация...</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Сгенерировать отчёт</>}
            </button>
          )}
          {report && (
            <button onClick={handleCopy}
              className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
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
      </div>

      {/* ======== No report yet ======== */}
      {!report && !loading && (
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
          ) : (
            <>
              <div className="flex justify-center mb-5 opacity-30">
                <Clock className="w-16 h-16" />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                {domains[domain].label}: отчёт пока не готов
              </h3>
              <p className="text-sm max-w-md mx-auto mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                Отчёты генерируются автоматически каждый день в <strong style={{ color: 'var(--color-text)' }}>8:00 МСК</strong>.
                <br />Или запустите генерацию вручную прямо сейчас.
              </p>
              <button onClick={generateReport} disabled={generating}
                className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Генерация...</>
                  : <><RefreshCw className="w-4 h-4" /> Сгенерировать сейчас</>}
              </button>
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
