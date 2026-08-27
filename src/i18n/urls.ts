import type { ContentLocale } from "./locales";

export type ContentSection =
  | "home"
  | "posts"
  | "courses"
  | "search"
  | "tags"
  | "archives"
  | "about";

export function localePrefix(locale: ContentLocale): "" | "/en" {
  return locale === "ko" ? "" : "/en";
}

export function localizedPath(locale: ContentLocale, path: string): string {
  const normalized = path.split("/").filter(Boolean).join("/");
  const prefix = localePrefix(locale);
  return normalized ? `${prefix}/${normalized}/` : `${prefix}/`;
}

export function sectionPath(
  locale: ContentLocale,
  section: ContentSection
): string {
  return localizedPath(locale, section === "home" ? "" : section);
}

export function detailPath(
  locale: ContentLocale,
  section: "posts" | "courses",
  ...slugs: string[]
): string {
  return localizedPath(locale, [section, ...slugs].join("/"));
}

export function translationTarget(
  targetLocale: ContentLocale,
  matchingDetailPath: string | undefined,
  fallbackSection: "posts" | "courses"
): string {
  return matchingDetailPath ?? sectionPath(targetLocale, fallbackSection);
}
