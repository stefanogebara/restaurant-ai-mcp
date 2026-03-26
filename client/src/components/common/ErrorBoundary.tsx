import { Component, type ReactNode } from 'react';
import { Sentry } from '../../lib/sentry';
import ThiingsIcon from './ThiingsIcon';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** If true, silently hide the component on error instead of showing an error UI */
  silent?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

/** Max auto-retries for transient errors (chunk load, network) */
const MAX_AUTO_RETRIES = 1;

/** Detect chunk/lazy-load failures that are transient and retryable */
function isChunkLoadError(error: Error): boolean {
  const message = error.message || '';
  return (
    message.includes('Loading chunk') ||
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    error.name === 'ChunkLoadError'
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });

    // Auto-retry for transient chunk load failures
    if (isChunkLoadError(error) && this.state.retryCount < MAX_AUTO_RETRIES) {
      this.retryTimer = setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1,
        }));
      }, 1500);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  render() {
    if (this.state.hasError) {
      // Silent mode: render nothing on error (used for non-critical UI like animations)
      if (this.props.silent) return null;

      // If auto-retry is pending for chunk errors, show loading instead of error
      if (isChunkLoadError(this.state.error!) && this.state.retryCount < MAX_AUTO_RETRIES) {
        return (
          <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
            <div className="font-serif text-2xl text-deep-charcoal opacity-50">
              seatable<span className="text-burgundy">.</span>
            </div>
            <div role="status" aria-label="Loading" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
          </div>
        );
      }

      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6">
          <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-md text-center shadow-sm">
            <div className="w-14 h-14 bg-red-600/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="alert-triangle" pxSize={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">Something went wrong</h3>
            <p className="text-sm text-stone-gray mb-4">
              An unexpected error occurred. Please refresh the page.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
