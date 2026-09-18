import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition",
        variant === "primary" && "bg-accent text-bg hover:bg-accent/90",
        variant === "secondary" && "border border-line bg-white/5 text-text hover:bg-white/10",
        variant === "ghost" && "text-muted hover:bg-white/5 hover:text-text",
        className,
      )}
      {...props}
    />
  );
}

