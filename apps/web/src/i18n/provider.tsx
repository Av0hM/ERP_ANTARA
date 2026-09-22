"use client";

import { useTranslations as useNextIntlTranslations, useLocale as useNextIntlLocale } from "next-intl";
import { Locale, routing } from "@/i18n/routing";

export function useLocale(): Locale {
  return useNextIntlLocale() as Locale;
}

export function useTranslations(namespace?: string) {
  return useNextIntlTranslations(namespace);
}