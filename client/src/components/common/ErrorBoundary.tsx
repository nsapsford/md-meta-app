import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; message: string; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="bg-md-red/10 border border-md-red/30 rounded-lg p-4 flex items-center justify-between m-4">
          <span className="text-md-red">Something went wrong: {this.state.message}</span>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-3 py-1 bg-md-red/20 hover:bg-md-red/30 rounded text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
