"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium transition",
        "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-saffron",
        size === "sm" && "px-3 py-1.5 text-xs min-h-8",
        size === "md" && "px-4 py-2 text-sm min-h-11",
        size === "lg" && "px-6 py-3 text-base min-h-12",
        variant === "primary" &&
          "bg-gradient-to-r from-saffron to-amber text-white border border-saffron/50 hover:from-saffron/90 hover:to-amber/90 shadow-[0_0_0_1px_rgba(201,120,43,0.3)]",
        variant === "secondary" &&
          "border border-steel/40 bg-white/5 text-text hover:bg-white/10",
        variant === "ghost" && "text-muted hover:bg-white/5 hover:text-text",
        variant === "outline" &&
          "border border-steel/40 bg-transparent hover:bg-white/5",
        variant === "danger" &&
          "bg-danger-bg text-danger border border-danger/40 hover:bg-danger/10",
        className,
      )}
      {...props}
    />
  );
}