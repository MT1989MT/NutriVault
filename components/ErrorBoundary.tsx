import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
    this.handleClearAndReset = this.handleClearAndReset.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('NutriVault Error:', error, errorInfo);
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  handleClearAndReset() {
    try {
      localStorage.removeItem('nutrivault_auth_session');
    } catch {}
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-[#FAFAF8] flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-lg text-center">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 mb-6">
              An unexpected error occurred. Your data is safe.
            </p>
            {this.state.error && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 text-left">
                <p className="text-xs text-gray-400 font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={this.handleReset}
                className="w-full bg-[#E07A5F] text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
              >
                Try Again
              </button>
              <button
                onClick={this.handleClearAndReset}
                className="w-full bg-gray-100 text-gray-600 font-medium py-3 rounded-xl active:scale-[0.98] transition-transform text-sm"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
