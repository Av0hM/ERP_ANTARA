export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
};

export const localeDirections: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  hi: "ltr",
};

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export function getLocaleFromPath(pathname: string): Locale {
  const segments = pathname.split("/");
  const firstSegment = segments[1];
  if (firstSegment && isValidLocale(firstSegment)) {
    return firstSegment;
  }
  return defaultLocale;
}

export function stripLocaleFromPath(pathname: string): string {
  const locale = getLocaleFromPath(pathname);
  if (pathname.startsWith(`/${locale}`)) {
    return pathname.slice(locale.length + 1) || "/";
  }
  return pathname;
}

export function addLocaleToPath(pathname: string, locale: Locale): string {
  if (pathname === "/") {
    return `/${locale}`;
  }
  return `/${locale}${pathname}`;
}