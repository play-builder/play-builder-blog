export const CONTENT_LOCALES = ["ko", "en"] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export const DEFAULT_LOCALE: ContentLocale = "ko";

export const TRANSLATION_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isContentLocale(value: unknown): value is ContentLocale {
  return value === "ko" || value === "en";
}

export function otherLocale(locale: ContentLocale): ContentLocale {
  return locale === "ko" ? "en" : "ko";
}
