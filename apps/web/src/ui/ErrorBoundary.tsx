import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** What to show instead of the app after something broke. */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Catches a crash anywhere in the page and shows a calm message with a way to reload, instead of
 * leaving a blank screen (M7-7). Reporting the error to a log service is M8 work (observability).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
