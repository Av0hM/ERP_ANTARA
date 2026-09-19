"use client";

import { NextIntlClientProvider } from "next-intl";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { Locale, locales, defaultLocale } from "@/i18n/config";

interface I18nProviderProps {
  children: React.ReactNode;
  messages: any;
  locale: Locale;
}

export function I18nProvider({ children, messages, locale }: I18nProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export function useLocale(): Locale {
  const params = useParams();
  const locale = params.locale as Locale;
  
  if (!locale || !["en", "hi"].includes(locale)) {
    return "en";
  }
  
  return locale;
}

export function useTranslations() {
  const locale = useLocale();
  // This would be replaced with next-intl's useTranslations hook in actual usage
  // For now, we return a simple translation function
  return (key: string) => key;
}