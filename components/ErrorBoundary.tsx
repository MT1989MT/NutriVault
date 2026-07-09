import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createLogger, exportLogs } from '../services/logger';

const log = createLogger('ErrorBoundary');

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
    this.handleCopyLogs = this.handleCopyLogs.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error(`Component crash: ${error.message}`, errorInfo.componentStack);
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  handleClearAndReset() {
    // Just reload — do NOT clear the auth session. With this app's anonymous
    // key model, a user who never saved their 16-digit code would be
    // permanently locked out of a paid account by a transient render crash.
    window.location.reload();
  }

  handleCopyLogs() {
    try {
      const logDump = exportLogs();
      navigator.clipboard.writeText(logDump).then(() => {
        const btn = document.getElementById('nv-copy-logs-btn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Debug Logs'; }, 2000); }
      });
    } catch {
      // Fallback: select text in the error box for manual copy
    }
  }

  /** Strip potentially sensitive data from error messages shown to users */
  private sanitizeErrorMessage(message: string): string {
    return message
      .replace(/https?:\/\/\S+/g, '[url]')
      .replace(/\/[\w./]+\.\w+/g, '[path]')
      .replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]')
      .slice(0, 200);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-[#FAF6F1] flex items-center justify-center p-6" role="alert" aria-live="assertive">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-lg text-center">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl" aria-hidden="true">!</span>
            </div>
            <h2 className="text-lg font-bold text-[#2B2523] mb-2">Something went wrong</h2>
            <p className="text-sm text-[#9A8B80] mb-6">
              An unexpected error occurred. Your data is safe.
            </p>
            {this.state.error && (
              <div className="bg-[#FAF6F1] rounded-xl p-3 mb-4 text-left">
                <p className="text-xs text-[#9A8B80] font-mono break-all">
                  {this.sanitizeErrorMessage(this.state.error.message)}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={this.handleReset}
                aria-label="Try again"
                className="w-full bg-[#E07A5F] text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
              >
                Try Again
              </button>
              <button
                id="nv-copy-logs-btn"
                onClick={this.handleCopyLogs}
                aria-label="Copy debug logs to clipboard"
                className="w-full bg-[#F3EAE2] text-[#6B6257] font-medium py-3 rounded-xl active:scale-[0.98] transition-transform text-sm"
              >
                Copy Debug Logs
              </button>
              <button
                onClick={this.handleClearAndReset}
                aria-label="Reload app"
                className="w-full text-[#9A8B80] font-medium py-2 rounded-xl text-xs"
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
