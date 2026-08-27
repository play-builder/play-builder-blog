import type { ContentLocale } from "@/i18n/locales";

type LocalizedEntry = { data: { locale: ContentLocale } };
type TranslatedEntry = LocalizedEntry & {
  data: { locale: ContentLocale; translationKey: string };
};

export function filterByLocale<T extends LocalizedEntry>(
  entries: readonly T[],
  locale: ContentLocale
): T[] {
  return entries.filter(entry => entry.data.locale === locale);
}

export function findTranslation<T extends TranslatedEntry>(
  entries: readonly T[],
  translationKey: string,
  targetLocale: ContentLocale
): T | undefined {
  return entries.find(
    entry =>
      entry.data.locale === targetLocale &&
      entry.data.translationKey === translationKey
  );
}

export function localizedEntryId(
  entry: string,
  collectionDirectory: "courses" | "lessons"
): string {
  const normalized = entry.replaceAll("\\", "/");
  const prefix = `${collectionDirectory}/`;
  if (!normalized.startsWith(prefix)) {
    throw new Error(
      `Content entry ${normalized} is outside ${collectionDirectory}`
    );
  }
  return normalized.slice(prefix.length).replace(/\.(?:json|md|mdx)$/, "");
}
