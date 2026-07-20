import { useState, useEffect, useCallback } from 'react';
import { Newspaper, Sparkles, BarChart3, Menu, X, Sun, Moon, Monitor } from 'lucide-react';
import { api, Article, ScrapeStatus, SourceStats } from './api';
import { ThemeProvider, useTheme } from './ThemeContext';
import { ToastProvider, useToast } from './ToastContext';
import Header from './components/Header';
import ScraperPanel from './components/ScraperPanel';
import StatsBar from './components/StatsBar';
import SourceFilter from './components/SourceFilter';
import ArticleList from './components/ArticleList';
import AISummarizer from './components/AISummarizer';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import { useAnalytics } from './useAnalytics';

type Tab = 'news' | 'ai' | 'analytics';

function AppContent() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [sources, setSources] = useState<SourceStats>({});
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('news');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const analytics = useAnalytics();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [articlesRes, statusRes, sourcesRes] = await Promise.all([
        api.getArticles({ limit: 500 }),
        api.getStatus(),
        api.getSources(),
      ]);
      setArticles(articlesRes.articles);
      setStatus(statusRes);
      setSources(sourcesRes);
    } catch (err: any) {
      toast.error(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!status?.running) return;
    const interval = setInterval(async () => {
      try {
        const s = await api.getStatus();
        setStatus(s);
        if (!s.running) {
          const [articlesRes, sourcesRes] = await Promise.all([
            api.getArticles({ limit: 500 }),
            api.getSources(),
          ]);
          setArticles(articlesRes.articles);
          setSources(sourcesRes);
          toast.success('Парсинг завершён');
        }
      } catch { /* poll silently */ }
    }, 1500);
    return () => clearInterval(interval);
  }, [status?.running]);

  const handleStartScrape = async (sourceId?: string) => {
    try {
      await api.startScrape(sourceId);
      const s = await api.getStatus();
      setStatus(s);
      toast.success(sourceId ? `Парсинг источника запущен` : 'Парсинг всех источников запущен');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStopScrape = async () => {
    try {
      await api.stopScrape();
      const s = await api.getStatus();
      setStatus(s);
      toast.warning('Парсинг остановлен');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResetStatus = async () => {
    try {
      await api.resetScrape();
      setStatus(await api.getStatus());
      toast.success('Статус сброшен');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredArticles = selectedSources.size > 0
    ? articles.filter(a => selectedSources.has(a.source))
    : articles;

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'news', icon: <Newspaper className="w-4 h-4" />, label: 'Новости' },
    { id: 'ai', icon: <Sparkles className="w-4 h-4" />, label: 'AI Сводка' },
    { id: 'analytics', icon: <BarChart3 className="w-4 h-4" />, label: 'Аналитика' },
  ];

  const themeIcon = theme === 'dark' ? <Moon className="w-4 h-4" /> : theme === 'light' ? <Sun className="w-4 h-4" /> : <Monitor className="w-4 h-4" />;
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

  const isRunning = status?.running ?? false;
  const progress = status?.progress;
  const scrapePercent = progress ? Math.round((progress.doneSources / progress.totalSources) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Scrape progress bar — top of page */}
      {isRunning && (
        <div className="progress-bar" style={{ height: 3, borderRadius: 0, position: 'sticky', top: 0, zIndex: 50 }}>
          <div className="progress-bar-fill" style={{ width: `${scrapePercent}%`, borderRadius: 0 }} />
        </div>
      )}

      <Header
        mobileMenuOpen={mobileMenuOpen}
        onToggleMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        themeIcon={themeIcon}
        onThemeToggle={() => setTheme(nextTheme)}
      />

      {/* Tab bar */}
      <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-7xl mx-auto px-3 md:px-4 flex overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
              className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent'
              }`}
              style={{ color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-6">
        {tab === 'news' ? (
          <>
            <div className="animate-fade-in">
              <ScraperPanel
                status={status}
                sources={sources}
                onStartScrape={handleStartScrape}
                onStopScrape={handleStopScrape}
                onResetStatus={handleResetStatus}
                onRefresh={loadData}
                loading={loading}
              />
            </div>

            <div className="animate-slide-up">
              <StatsBar articles={articles} sources={sources} loading={loading} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
              <aside className="lg:col-span-1 order-2 lg:order-1">
                <SourceFilter sources={sources} selected={selectedSources} onChange={setSelectedSources} />
              </aside>
              <section className="lg:col-span-3 order-1 lg:order-2">
                <ArticleList articles={filteredArticles} loading={loading} />
              </section>
            </div>
          </>
        ) : tab === 'ai' ? (
          <div className="animate-fade-in">
            <AISummarizer sources={sources} />
          </div>
        ) : (
          <div className="animate-fade-in">
            <AnalyticsDashboard sources={sources} analytics={analytics} />
          </div>
        )}
      </main>

      <footer style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
        className="py-3 text-center text-xs" >
        <span style={{ color: 'var(--color-text-muted)' }}>
          СтройПарсер — аналитическая платформа строительной отрасли России
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
