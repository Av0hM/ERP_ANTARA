"use client";

import { HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "glass" | "card-dark" | "card-light";
  className?: string;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ variant = "default", className, children, ...props }, ref) => {
    const baseStyles =
      "rounded-[0.95rem] transition-shadow duration-200 ease-premium";

    const variantStyles = {
      default: "border border-line bg-panel/90",
      glass:
        "border border-white/10 bg-white/5 backdrop-blur-xl shadow-glass",
      "card-dark":
        "border border-steel/40 bg-gradient-to-b from-space-panel to-graphite text-text shadow-glass",
      "card-light":
        "border border-steel/40 bg-gradient-to-b from-paper-highlight to-paper text-admin-ink shadow-glass",
    };

    return (
      <div
        ref={ref}
        className={clsx(baseStyles, variantStyles[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Panel.displayName = "Panel";