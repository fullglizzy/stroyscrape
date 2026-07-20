import { useState, useEffect, useCallback } from 'react';
import { api, Article, ScrapeStatus, SourceStats } from './api';
import Header from './components/Header';
import ScraperPanel from './components/ScraperPanel';
import StatsBar from './components/StatsBar';
import SourceFilter from './components/SourceFilter';
import ArticleList from './components/ArticleList';
import AISummarizer from './components/AISummarizer';
import { Newspaper, Sparkles, BarChart3 } from 'lucide-react';
import AnalyticsDashboard from './components/AnalyticsDashboard';

type Tab = 'news' | 'ai' | 'analytics';

export default function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [sources, setSources] = useState<SourceStats>({});
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('news');

  // Загрузка данных
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
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Polling статуса во время парсинга
  useEffect(() => {
    if (!status?.running) return;
    const interval = setInterval(async () => {
      try {
        const s = await api.getStatus();
        setStatus(s);
        if (!s.running) {
          const articlesRes = await api.getArticles({ limit: 500 });
          setArticles(articlesRes.articles);
          const sourcesRes = await api.getSources();
          setSources(sourcesRes);
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [status?.running]);

  // Запуск парсинга
  const handleStartScrape = async (sourceId?: string) => {
    try {
      await api.startScrape(sourceId);
      const s = await api.getStatus();
      setStatus(s);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Остановка парсинга
  const handleStopScrape = async () => {
    try {
      await api.stopScrape();
      const s = await api.getStatus();
      setStatus(s);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Сброс зависшего статуса
  const handleResetStatus = async () => {
    try {
      await api.resetScrape();
      const s = await api.getStatus();
      setStatus(s);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Фильтрация по источникам
  const filteredArticles = selectedSources.size > 0
    ? articles.filter(a => selectedSources.has(a.source))
    : articles;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Табы */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 flex gap-0">
          <button
            onClick={() => setTab('news')}
            className={`
              flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors
              ${tab === 'news'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <Newspaper className="w-4 h-4" />
            Новости
          </button>
          <button
            onClick={() => setTab('ai')}
            className={`
              flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors
              ${tab === 'ai'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <Sparkles className="w-4 h-4" />
            AI Суммаризация
          </button>
          <button
            onClick={() => setTab('analytics')}
            className={`
              flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors
              ${tab === 'analytics'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <BarChart3 className="w-4 h-4" />
            Аналитика
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {tab === 'news' ? (
          <>
            {/* Панель управления парсингом */}
            <ScraperPanel
              status={status}
              sources={sources}
              onStartScrape={handleStartScrape}
              onStopScrape={handleStopScrape}
              onResetStatus={handleResetStatus}
              onRefresh={loadData}
              loading={loading}
            />

            {/* Статистика */}
            <StatsBar articles={articles} sources={sources} />

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
                ⚠️ {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Фильтр источников */}
              <aside className="lg:col-span-1">
                <SourceFilter
                  sources={sources}
                  selected={selectedSources}
                  onChange={setSelectedSources}
                />
              </aside>

              {/* Список статей */}
              <section className="lg:col-span-3">
                <ArticleList articles={filteredArticles} loading={loading} />
              </section>
            </div>
          </>
        ) : tab === 'ai' ? (
          /* AI Суммаризация */
          <AISummarizer sources={sources} />
        ) : (
          /* Аналитика */
          <AnalyticsDashboard sources={sources} />
        )}
      </main>

      <footer className="bg-white border-t py-4 text-center text-sm text-gray-500">
        СтройПарсер — агрегатор новостей строительной отрасли России
      </footer>
    </div>
  );
}
