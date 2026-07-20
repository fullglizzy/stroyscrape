import { HardHat, Menu, X } from 'lucide-react';

interface Props {
  mobileMenuOpen: boolean;
  onToggleMenu: () => void;
  themeIcon: React.ReactNode;
  onThemeToggle: () => void;
}

export default function Header({ mobileMenuOpen, onToggleMenu, themeIcon, onThemeToggle }: Props) {
  return (
    <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
      className="sticky top-0 z-40">
      <div className="px-3 md:px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button onClick={onToggleMenu}
            className="md:hidden btn-ghost p-2 rounded-lg"
            style={{ color: 'var(--color-text-secondary)' }}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
            <HardHat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              СтройПарсер
            </h1>
            <p className="text-xs hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>
              Аналитика строительного рынка
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onThemeToggle} className="theme-toggle" title="Сменить тему" />
        </div>
      </div>
    </header>
  );
}
