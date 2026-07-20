export function Skeleton({ className = '', width, height }: { className?: string; width?: string; height?: string }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width: width || '100%', height: height || '1rem' }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-5 space-y-3 animate-pulse">
      <Skeleton height="1.25rem" width="60%" />
      <div className="flex gap-2">
        <Skeleton height="1rem" width="5rem" />
        <Skeleton height="1rem" width="7rem" />
      </div>
      <Skeleton height="5rem" />
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="card p-4 flex items-center gap-3 animate-pulse">
          <Skeleton width="2.5rem" height="2.5rem" />
          <div className="flex-1 space-y-1">
            <Skeleton height="0.75rem" width="60%" />
            <Skeleton height="1.25rem" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-12 text-center animate-fade-in">
      <div className="mx-auto mb-4 opacity-30">{icon}</div>
      <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text)' }}>{title}</h3>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
      {action}
    </div>
  );
}
