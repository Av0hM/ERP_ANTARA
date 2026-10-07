import Image from "next/image";
import Link from "next/link";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label="ANTARA ERP home"
      className="flex shrink-0 items-center gap-2"
    >
      <Image
        src="/antara-badge.png"
        alt="ANTARA logo"
        width={44}
        height={44}
        className="size-11 shrink-0"
      />
      <span
        className={compact ? "sr-only" : "text-sm font-semibold tracking-wider"}
      >
        ANTARA ERP
      </span>
    </Link>
  );
}
