"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  /** Which background this button sits on. "light" = inside a
   *  section-light/card-light container (paper background). Only affects
   *  secondary/ghost/outline — primary and danger are surface-independent. */
  surface?: "dark" | "light";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  surface = "dark",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron",
        size === "sm" && "px-3 py-1.5 text-xs min-h-8",
        size === "md" && "px-4 py-2 text-sm min-h-11",
        size === "lg" && "px-6 py-3 text-base min-h-12",
        variant === "primary" &&
          "bg-saffron text-white border border-saffron/50 hover:bg-saffron/90 shadow-[0_0_0_1px_rgba(201,120,43,0.3)]",
        variant === "secondary" &&
          surface === "dark" &&
          "border border-steel/40 bg-white/5 text-text hover:bg-white/10",
        variant === "secondary" &&
          surface === "light" &&
          "border border-steel/40 bg-black/5 text-admin-ink hover:bg-black/10",
        variant === "ghost" &&
          surface === "dark" &&
          "text-muted hover:bg-white/5 hover:text-text",
        variant === "ghost" &&
          surface === "light" &&
          "text-secondary-ink hover:bg-black/5 hover:text-admin-ink",
        variant === "outline" &&
          surface === "dark" &&
          "border border-steel/40 bg-transparent text-text hover:bg-white/5",
        variant === "outline" &&
          surface === "light" &&
          "border border-steel/40 bg-transparent text-admin-ink hover:bg-black/5",
        variant === "danger" &&
          "bg-danger/15 text-[#ff6b6b] border border-danger/50 hover:bg-danger/25",
        className,
      )}
      {...props}
    />
  );
}