"use client";
import { useEffect, useState } from "react";
export function ConnectivityStatus() {
  const [state, setState] = useState<"online" | "offline" | "restored">(
    "online",
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const online = () => {
      setState("restored");
      clearTimeout(timer);
      timer = setTimeout(() => setState("online"), 5000);
    };
    if (!navigator.onLine) offline();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  if (state === "online") return null;
  return (
    <p
      role="status"
      className="border-b border-steel/30 bg-panel p-3 text-center text-sm"
    >
      {state === "offline"
        ? "You're offline. Keep this page open to preserve unsaved input. Changes will not be resubmitted automatically."
        : "Back online. Check the latest state before retrying a change."}
    </p>
  );
}
