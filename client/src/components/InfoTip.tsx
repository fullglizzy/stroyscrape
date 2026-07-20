import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export default function InfoTip({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs transition-colors flex-shrink-0"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
        title={title}>
        ?
      </button>
      {open && (
        <div className="absolute top-7 left-0 z-50 w-72 p-4 rounded-lg text-xs leading-relaxed animate-slide-down"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{title}</span>
            <button onClick={() => setOpen(false)} style={{ color: 'var(--color-text-muted)' }}><X className="w-3.5 h-3.5" /></button>
          </div>
          <div style={{ color: 'var(--color-text-secondary)' }}>{children}</div>
        </div>
      )}
    </span>
  );
}
