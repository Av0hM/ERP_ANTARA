"use client";

import { Component, type ReactNode } from "react";

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

  render() {
    if (this.state.hasError) {
      return (
        <div className="section-dark grid-texture-dark flex min-h-[50vh] flex-col items-center justify-center rounded-[2rem] p-8 text-center">
          <h2 className="text-xl font-semibold">
            ANTARA ERP could not display this page
          </h2>
          <p className="mt-3 text-sm text-muted">
            Return to the dashboard or reload. Check saved records before
            repeating a change.
          </p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
