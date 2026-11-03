import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** What to show instead of the app after something broke. */
  fallback: ReactNode;
  children: ReactNode;
  /** Called with the error once, so it can be reported. */
  onError?: (error: Error) => void;
}

/**
 * Catches a crash anywhere in the page and shows a calm message with a way to reload, instead of
 * leaving a blank screen (M7-7). `onError` lets the page report what broke (M8-3).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
