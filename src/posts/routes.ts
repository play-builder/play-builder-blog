import type { Page } from "astro";
import type { CollectionEntry } from "astro:content";
import { filterByLocale, findTranslation } from "@/content/localized";
import {
  CONTENT_LOCALES,
  otherLocale,
  type ContentLocale,
} from "@/i18n/locales";
import {
  detailPath,
  localizedPath,
  sectionPath,
  translationTarget,
} from "@/i18n/urls";
import { getPostSlugPath } from "@/utils/getPostSlug";
import siteConfig from "../../astro-paper.config";

export type PostAlternate = {
  locale: ContentLocale;
  href: string;
};

export type PostRouteData = {
  locale: ContentLocale;
  post: CollectionEntry<"posts">;
  slug: string;
  prevPost: CollectionEntry<"posts"> | null;
  nextPost: CollectionEntry<"posts"> | null;
  languageHref: string;
  alternates: PostAlternate[];
  xDefaultHref: string;
};

export type PostOgRouteData = {
  slug: string;
  post: CollectionEntry<"posts">;
};

export function getPostsForLocaleFrom(
  posts: readonly CollectionEntry<"posts">[],
  locale: ContentLocale
): CollectionEntry<"posts">[] {
  const scheduledPostMargin =
    siteConfig.posts?.scheduledPostMargin ?? 15 * 60 * 1000;
  return filterByLocale(posts, locale)
    .filter(({ data }) => {
      const isPublishTimePassed =
        Date.now() > new Date(data.pubDatetime).getTime() - scheduledPostMargin;
      return !data.draft && (import.meta.env.DEV || isPublishTimePassed);
    })
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
        ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        )
    );
}

export function postPageHref(
  locale: ContentLocale,
  pageNumber: number
): string {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error(
      `Post page number must be a positive integer: ${pageNumber}`
    );
  }
  return localizedPath(
    locale,
    pageNumber === 1 ? "posts" : `posts/${pageNumber}`
  );
}

export function emptyPostPage(
  locale: ContentLocale,
  pageSize: number
): Page<CollectionEntry<"posts">> {
  const current = postPageHref(locale, 1);
  return {
    data: [],
    start: 0,
    end: 0,
    total: 0,
    currentPage: 1,
    size: pageSize,
    lastPage: 1,
    url: {
      current,
      prev: undefined,
      next: undefined,
      first: undefined,
      last: undefined,
    },
  };
}

export function getPostOgRouteDataFrom(
  posts: readonly CollectionEntry<"posts">[],
  locale: ContentLocale
): PostOgRouteData[] {
  return getPostsForLocaleFrom(posts, locale)
    .filter(post => !post.data.ogImage)
    .map(post => ({
      slug: getPostSlugPath(post.id, post.filePath),
      post,
    }));
}

function postHref(
  post: CollectionEntry<"posts">,
  locale: ContentLocale
): string {
  return detailPath(locale, "posts", getPostSlugPath(post.id, post.filePath));
}

function publishedPosts(
  posts: readonly CollectionEntry<"posts">[]
): CollectionEntry<"posts">[] {
  return CONTENT_LOCALES.flatMap(locale =>
    getPostsForLocaleFrom(posts, locale)
  );
}

export function getPostTranslationHref(
  post: CollectionEntry<"posts">,
  allPosts: readonly CollectionEntry<"posts">[],
  targetLocale: ContentLocale
): string {
  const translation = findTranslation(
    publishedPosts(allPosts),
    post.data.translationKey,
    targetLocale
  );
  return translation
    ? postHref(translation, targetLocale)
    : sectionPath(targetLocale, "posts");
}

export function buildPostRouteData(
  posts: readonly CollectionEntry<"posts">[],
  locale: ContentLocale
): PostRouteData[] {
  const localizedPosts = getPostsForLocaleFrom(posts, locale);
  const eligiblePosts = publishedPosts(posts);
  const targetLocale = otherLocale(locale);

  return localizedPosts.map((post, index) => {
    const translatedPost = findTranslation(
      eligiblePosts,
      post.data.translationKey,
      targetLocale
    );
    const koreanPost = findTranslation(
      eligiblePosts,
      post.data.translationKey,
      "ko"
    );
    const currentHref = postHref(post, locale);
    const translatedHref = translatedPost
      ? postHref(translatedPost, targetLocale)
      : undefined;

    return {
      locale,
      post,
      slug: getPostSlugPath(post.id, post.filePath),
      prevPost: localizedPosts[index - 1] ?? null,
      nextPost: localizedPosts[index + 1] ?? null,
      languageHref: translationTarget(targetLocale, translatedHref, "posts"),
      alternates: CONTENT_LOCALES.flatMap(alternateLocale => {
        if (alternateLocale === locale) {
          return [{ locale: alternateLocale, href: currentHref }];
        }
        return translatedHref
          ? [{ locale: alternateLocale, href: translatedHref }]
          : [];
      }),
      xDefaultHref: koreanPost ? postHref(koreanPost, "ko") : currentHref,
    };
  });
}

export async function getPostsForLocale(
  locale: ContentLocale
): Promise<CollectionEntry<"posts">[]> {
  const { getCollection } = await import("astro:content");
  return getPostsForLocaleFrom(await getCollection("posts"), locale);
}

export async function getPostRouteData(
  locale: ContentLocale
): Promise<PostRouteData[]> {
  const { getCollection } = await import("astro:content");
  return buildPostRouteData(await getCollection("posts"), locale);
}

export async function getPostOgRouteData(
  locale: ContentLocale
): Promise<PostOgRouteData[]> {
  const { getCollection } = await import("astro:content");
  return getPostOgRouteDataFrom(await getCollection("posts"), locale);
}
