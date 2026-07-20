import { HardHat } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-white border-b shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <HardHat className="w-7 h-7 text-amber-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            СтройПарсер
          </h1>
          <p className="text-xs text-gray-500">
            Новости строительной отрасли России
          </p>
        </div>
      </div>
    </header>
  );
}
