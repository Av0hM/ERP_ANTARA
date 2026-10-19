"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
/** Only bounded, non-sensitive choices belong in URLs. Search text stays local. */
export function useUrlChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): readonly [T, (value: T) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selected =
    allowed.find((value) => value === params.get(key)) ?? fallback;
  const select = (value: T) => {
    if (!allowed.includes(value)) return;
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return [selected, select];
}
