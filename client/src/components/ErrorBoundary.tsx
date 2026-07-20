import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
          <div className="card p-8 max-w-md w-full text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text)' }}>Что-то пошло не так</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              {this.state.error?.message || 'Непредвиденная ошибка приложения'}
            </p>
            <button onClick={this.handleReset}
              className="btn text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
              <RefreshCw className="w-4 h-4" /> Перезагрузить
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
