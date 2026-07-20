import { SourceStats } from '../api';
import { Filter, Check } from 'lucide-react';

interface Props {
  sources: SourceStats;
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function SourceFilter({ sources, selected, onChange }: Props) {
  const sourceList = Object.entries(sources).sort((a, b) => b[1].count - a[1].count);

  const toggle = (sourceId: string) => {
    const next = new Set(selected);
    if (next.has(sourceId)) {
      next.delete(sourceId);
    } else {
      next.add(sourceId);
    }
    onChange(next);
  };

  const selectAll = () => {
    if (selected.size === sourceList.length) {
      onChange(new Set());
    } else {
      onChange(new Set(sourceList.map(([id]) => id)));
    }
  };

  if (sourceList.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Filter className="w-4 h-4" />
          <span>Нет источников</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 sticky top-20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Filter className="w-4 h-4" />
          <span>Источники</span>
        </div>
        <button
          onClick={selectAll}
          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          {selected.size === sourceList.length ? 'Снять всё' : 'Выбрать всё'}
        </button>
      </div>

      <div className="space-y-1">
        {sourceList.map(([id, info]) => (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={`
              w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors
              ${selected.has(id)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
              }
            `}
          >
            <div className={`
              w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors
              ${selected.has(id)
                ? 'bg-blue-600 border-blue-600'
                : 'border-gray-300'
              }
            `}>
              {selected.has(id) && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="truncate flex-1">{info.name}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{info.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
