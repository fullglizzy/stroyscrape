import { useState } from 'react';
import { SourceStats } from '../api';
import {
  LayoutDashboard, Newspaper, Sparkles, BarChart3, Play,
  Filter, Check, Search, X, HardHat,
} from 'lucide-react';

export type Section = 'overview' | 'news' | 'ai' | 'analytics' | 'scraper';

const NAV_ITEMS: { id: Section; icon: React.ReactNode; label: string }[] = [
  { id: 'overview',   icon: <LayoutDashboard className="w-4 h-4" />, label: 'Обзор' },
  { id: 'news',       icon: <Newspaper className="w-4 h-4" />,       label: 'Новости' },
  { id: 'ai',         icon: <Sparkles className="w-4 h-4" />,        label: 'AI Сводка' },
  { id: 'analytics',  icon: <BarChart3 className="w-4 h-4" />,       label: 'Аналитика' },
  { id: 'scraper',    icon: <Play className="w-4 h-4" />,            label: 'Парсер' },
];

interface Props {
  section: Section;
  onNavigate: (s: Section) => void;
  sources: SourceStats;
  selectedSources: Set<string>;
  onSourceChange: (selected: Set<string>) => void;
  sidebarOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ section, onNavigate, sources, selectedSources, onSourceChange, sidebarOpen, onClose }: Props) {
  const [sourceSearch, setSourceSearch] = useState('');

  const sourceList = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);
  const filteredSources = sourceSearch
    ? sourceList.filter(([, info]) => info.name.toLowerCase().includes(sourceSearch.toLowerCase()))
    : sourceList;

  const toggleSource = (id: string) => {
    const next = new Set(selectedSources);
    next.has(id) ? next.delete(id) : next.add(id);
    onSourceChange(next);
  };

  const selectAllSources = () => {
    if (selectedSources.size === sourceList.length) onSourceChange(new Set());
    else onSourceChange(new Set(sourceList.map(([id]) => id)));
  };

  const handleNav = (s: Section) => {
    onNavigate(s);
    onClose();
  };

  const sidebarContent = (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-surface)' }}>
      {/* Logo area (mobile) */}
      <div className="flex items-center justify-between p-4 md:hidden" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
            <HardHat className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>СтройПарсер</span>
        </div>
        <button onClick={onClose} className="p-1 rounded" style={{ color: 'var(--color-text-muted)' }}>
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-2 space-y-0.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => handleNav(item.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left"
            style={{
              background: section === item.id ? 'var(--color-primary-bg)' : 'transparent',
              color: section === item.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Source filter */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            <Filter className="w-3.5 h-3.5" /> Источники
          </div>
          <button onClick={selectAllSources} className="text-xs font-medium"
            style={{ color: 'var(--color-primary)' }}>
            {selectedSources.size === sourceList.length ? 'Снять' : 'Все'}
          </button>
        </div>

        <div className="relative px-2 mb-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
          <input
            value={sourceSearch}
            onChange={e => setSourceSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-7 pr-2 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>

        <div className="space-y-0.5 px-1">
          {filteredSources.length === 0 ? (
            <div className="text-xs px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>Ничего не найдено</div>
          ) : (
            filteredSources.map(([id, info]) => (
              <button key={id} onClick={() => toggleSource(id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors"
                style={selectedSources.has(id)
                  ? { background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }
                  : { color: 'var(--color-text-secondary)' }
                }
              >
                <div className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0"
                  style={selectedSources.has(id)
                    ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }
                    : { borderColor: 'var(--color-border)' }
                  }
                >
                  {selectedSources.has(id) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="truncate flex-1">{info.name}</span>
                <span className="text-xs flex-shrink-0 opacity-60">{info.count}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-60 lg:w-64 flex-shrink-0"
        style={{ borderRight: '1px solid var(--color-border)' }}>
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 animate-slide-down">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
