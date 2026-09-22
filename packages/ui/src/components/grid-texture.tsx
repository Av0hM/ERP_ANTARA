"use client";

import { HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

export interface GridTextureProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "dark" | "light";
  className?: string;
}

export const GridTexture = forwardRef<HTMLDivElement, GridTextureProps>(
  ({ variant = "dark", className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          "relative isolate",
          variant === "dark" && "bg-graphite text-text",
          variant === "light" && "bg-paper text-admin-ink",
          className
        )}
        {...props}
      >
        <div
          className={clsx(
            "pointer-events-none absolute inset-0 -z-10",
            "bg-[size:44px_44px]",
            "[mask-image:linear-gradient(180deg,transparent,#000_16%,#000_84%,transparent)]",
            "[-webkit-mask-image:linear-gradient(180deg,transparent,#000_16%,#000_84%,transparent)]",
            variant === "dark" && "bg-grid-texture-dark",
            variant === "light" && "bg-grid-texture-light"
          )}
          aria-hidden="true"
        />
        {children}
      </div>
    );
  }
);

GridTexture.displayName = "GridTexture";