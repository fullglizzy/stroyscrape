import { useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { api, Article, ScrapeStatus, SourceStats } from './api';
import { ThemeProvider, useTheme } from './ThemeContext';
import { ToastProvider, useToast } from './ToastContext';
import Header from './components/Header';
import Sidebar, { Section } from './components/Sidebar';
import ScraperPanel from './components/ScraperPanel';
import ArticleList from './components/ArticleList';
import AISummarizer from './components/AISummarizer';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import Overview from './components/Overview';
import { useAnalytics } from './useAnalytics';

function AppContent() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [sources, setSources] = useState<SourceStats>({});
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const analytics = useAnalytics();

  // ---- Data loading ----
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
  }, []); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  // ---- Poll during scrape ----
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

  // ---- Scrape handlers ----
  const handleStartScrape = async (sourceId?: string) => {
    try {
      await api.startScrape(sourceId);
      const s = await api.getStatus();
      setStatus(s);
      toast.success(sourceId ? 'Парсинг источника запущен' : 'Парсинг запущен');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleStopScrape = async () => {
    try {
      await api.stopScrape();
      const s = await api.getStatus();
      setStatus(s);
      toast.warning('Парсинг остановлен');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleResetStatus = async () => {
    try {
      await api.resetScrape();
      setStatus(await api.getStatus());
      toast.success('Статус сброшен');
    } catch (err: any) { toast.error(err.message); }
  };

  // ---- Article filtering ----
  const filteredArticles = selectedSources.size > 0
    ? articles.filter(a => selectedSources.has(a.source))
    : articles;

  // ---- Theme ----
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

  // ---- Footer data ----
  const lastScrapeTime = status?.lastRun ? new Date(status.lastRun).toLocaleString('ru-RU') : null;
  const totalArticles = Object.values(sources).reduce((s, info) => s + info.count, 0);
  const activeSourceCount = Object.values(sources).filter(s => s.count > 0).length;
  const totalSourceCount = Object.keys(sources).length;
  const freshnessColor = lastScrapeTime && (Date.now() - new Date(status!.lastRun!).getTime()) < 3 * 3600000
    ? 'var(--color-success)' : 'var(--color-warning)';

  // ---- Section renderer ----
  const renderSection = () => {
    switch (section) {
      case 'overview':
        return (
          <Overview
            sources={sources}
            metrics={analytics.metrics}
            forecast={analytics.forecast}
            onNavigate={(s) => setSection(s as Section)}
            onExtract={() => setSection('analytics')}
          />
        );
      case 'news':
        return (
          <div className="space-y-4 animate-fade-in">
            <ArticleList articles={filteredArticles} loading={loading} />
          </div>
        );
      case 'ai':
        return (
          <AISummarizer
            sources={sources}
            selectedSources={selectedSources}
          />
        );
      case 'analytics':
        return (
          <AnalyticsDashboard
            sources={sources}
            analytics={analytics}
            onNavigate={(t) => setSection(t as Section)}
          />
        );
      case 'scraper':
        return (
          <ScraperPanel
            status={status}
            sources={sources}
            onStartScrape={handleStartScrape}
            onStopScrape={handleStopScrape}
            onResetStatus={handleResetStatus}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Top progress bar */}
      {status?.running && (
        <div className="progress-bar" style={{ height: 3, borderRadius: 0, position: 'sticky', top: 0, zIndex: 50 }}>
          <div className="progress-bar-fill" style={{
            width: `${status.progress ? Math.round((status.progress.doneSources / status.progress.totalSources) * 100) : 0}%`,
            borderRadius: 0,
          }} />
        </div>
      )}

      <Header
        mobileMenuOpen={sidebarOpen}
        onToggleMenu={() => setSidebarOpen(!sidebarOpen)}
        themeIcon={<></>}
        onThemeToggle={() => setTheme(nextTheme)}
      />

      {/* Main layout: Sidebar + Content */}
      <div className="flex flex-1">
        <Sidebar
          section={section}
          onNavigate={setSection}
          sources={sources}
          selectedSources={selectedSources}
          onSourceChange={setSelectedSources}
          sidebarOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content */}
        <main className="flex-1 min-w-0 px-3 md:px-5 py-4 md:py-6">
          <div className="max-w-5xl mx-auto">
            {renderSection()}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
        className="py-2.5 px-4 text-xs flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
        <span style={{ color: 'var(--color-text-muted)' }}>
          СтройПарсер — аналитика строительного рынка
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <span style={{ color: 'var(--color-text-muted)' }}>
            📰 {totalArticles} статей
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>
            📡 {activeSourceCount}/{totalSourceCount} источников
          </span>
          {lastScrapeTime && (
            <span className="flex items-center gap-1" style={{ color: freshnessColor }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: freshnessColor }} />
              {lastScrapeTime}
            </span>
          )}
        </div>
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
