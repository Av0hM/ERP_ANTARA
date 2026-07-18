import { HTMLAttributes } from "react";
import { clsx } from "clsx";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-3xl border border-white/10 bg-white/5", className)} {...props} />;
}
