"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="section-dark grid-texture-dark flex min-h-[50vh] flex-col items-center justify-center rounded-[2rem] p-8 text-center">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="mt-3 text-sm text-muted">{this.state.error?.message ?? "An unexpected error occurred."}</p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}