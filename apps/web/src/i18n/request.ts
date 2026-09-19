import { getRequestConfig } from "next-intl/server";
import { locales, Locale, defaultLocale } from "@/i18n/config";

export default getRequestConfig(async ({ locale }) => {
  const validLocale = locale && ["en", "hi"].includes(locale) ? locale : "en";
  
  return {
    locale: validLocale,
    messages: (await import(`@/messages/${validLocale}.json`)).default,
    timeZone: "Asia/Kolkata",
    now: new Date(),
  };
});