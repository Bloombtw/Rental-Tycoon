import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children?: ReactNode;
  /** Local replacement shown instead of the full-page error. */
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly failed: boolean;
}

/** Catches render errors so the player never faces a blank screen. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Render error caught by ErrorBoundary", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <main className="app error-fallback" role="alert" data-testid="error-fallback">
          <h1>Oups</h1>
          <p>Une erreur inattendue est survenue. Rechargez la page pour recommencer.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
