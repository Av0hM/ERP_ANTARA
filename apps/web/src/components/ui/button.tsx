import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
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
        "inline-flex items-center justify-center rounded-xl text-sm font-medium transition",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2",
        size === "lg" && "px-6 py-3",
        variant === "primary" && "bg-accent text-bg hover:bg-accent/90",
        variant === "secondary" && "border border-line bg-white/5 text-text hover:bg-white/10",
        variant === "ghost" && "text-muted hover:bg-white/5 hover:text-text",
        variant === "outline" && "border border-line bg-transparent hover:bg-white/5",
        className,
      )}
      {...props}
    />
  );
}

