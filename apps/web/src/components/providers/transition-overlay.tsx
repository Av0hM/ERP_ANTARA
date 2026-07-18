"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function TransitionOverlay() {
  const pathname = usePathname();
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const routeSignature = useMemo(() => pathname, [pathname]);

  useEffect(() => {
    const clearPending = () => {
      setIsPending(false);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleClear = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(clearPending, 900);
    };

    const markPending = () => {
      setIsPending(true);
      scheduleClear();
    };

    const onClickCapture = (event: MouseEvent) => {
      if (isModifiedClick(event)) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href], button[data-transition='true']") as HTMLAnchorElement | HTMLButtonElement | null;

      if (!link) {
        return;
      }

      if (link instanceof HTMLAnchorElement) {
        const url = new URL(link.href, window.location.href);
        if (url.origin === window.location.origin) {
          markPending();
        }
        return;
      }

      markPending();
    };

    const onSubmitCapture = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      if (form) {
        markPending();
      }
    };

    window.addEventListener("click", onClickCapture, true);
    window.addEventListener("submit", onSubmitCapture, true);
    return () => {
      window.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("submit", onSubmitCapture, true);
      clearPending();
    };
  }, []);

  useEffect(() => {
    setIsPending(false);
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [routeSignature]);

  return (
    <AnimatePresence>
      {isPending ? (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/15 backdrop-blur-[1px]"
        >
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/60 px-4 py-3 shadow-2xl shadow-black/30">
            <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
            <span className="text-sm text-white/80">Working</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
