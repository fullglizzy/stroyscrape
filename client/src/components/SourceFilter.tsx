import { SourceStats } from '../api';
import { Filter, Check, Search } from 'lucide-react';
import { useState } from 'react';

interface Props {
  sources: SourceStats;
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function SourceFilter({ sources, selected, onChange }: Props) {
  const [search, setSearch] = useState('');
  const sourceList = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);
  const filtered = search
    ? sourceList.filter(([, info]) => info.name.toLowerCase().includes(search.toLowerCase()))
    : sourceList;

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const selectAll = () => {
    if (selected.size === sourceList.length) onChange(new Set());
    else onChange(new Set(sourceList.map(([id]) => id)));
  };

  return (
    <div className="card p-4 lg:sticky lg:top-20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          <Filter className="w-4 h-4" /> Источники
        </div>
        <button onClick={selectAll} className="text-xs font-medium"
          style={{ color: 'var(--color-primary)' }}>
          {selected.size === sourceList.length ? 'Снять всё' : 'Все'}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        />
      </div>

      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {filtered.map(([id, info]) => (
          <button key={id} onClick={() => toggle(id)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors ${
              selected.has(id) ? '' : ''
            }`}
            style={selected.has(id)
              ? { background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }
              : { color: 'var(--color-text-secondary)' }
            }>
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
              selected.has(id) ? '' : ''
            }`}
            style={selected.has(id)
              ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }
              : { borderColor: 'var(--color-border)' }
            }>
              {selected.has(id) && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="truncate flex-1">{info.name}</span>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{info.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
