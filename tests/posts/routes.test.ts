import type { CollectionEntry } from "astro:content";
import { describe, expect, it } from "vitest";
import {
  buildPostRouteData,
  getPostOgRouteDataFrom,
  getPostsForLocaleFrom,
  postPageHref,
} from "@/posts/routes";
import type { ContentLocale } from "@/i18n/locales";

const post = (
  locale: ContentLocale,
  slug: string,
  translationKey: string,
  published: string,
  modified?: string,
  draft = false
): CollectionEntry<"posts"> =>
  ({
    id: `${locale}/${slug}`,
    filePath: `src/content/posts/${locale}/${slug}.md`,
    data: {
      title: `${locale}-${slug}`,
      description: `${locale}-${slug}`,
      locale,
      translationKey,
      pubDatetime: new Date(published),
      modDatetime: modified ? new Date(modified) : undefined,
      draft,
      tags: [],
      author: "PlayBuilder",
    },
  }) as unknown as CollectionEntry<"posts">;

const posts = [
  post("ko", "old-korean", "shared", "2026-01-01T00:00:00Z"),
  post(
    "en",
    "translated-with-another-slug",
    "shared",
    "2026-01-02T00:00:00Z"
  ),
  post(
    "ko",
    "recent-korean",
    "korean-only",
    "2026-01-03T00:00:00Z",
    "2026-01-05T00:00:00Z"
  ),
  post("ko", "draft-korean", "draft", "2026-01-06T00:00:00Z", undefined, true),
];

describe("localized Post route data", () => {
  it("filters before sorting and excludes Draft Posts", () => {
    const korean = getPostsForLocaleFrom(posts, "ko");
    const english = getPostsForLocaleFrom(posts, "en");

    expect(korean.map(entry => entry.data.title)).toEqual([
      "ko-recent-korean",
      "ko-old-korean",
    ]);
    expect(korean.every(entry => entry.data.locale === "ko")).toBe(true);
    expect(english.map(entry => entry.data.title)).toEqual([
      "en-translated-with-another-slug",
    ]);
  });

  it("builds locale-prefixed pagination paths", () => {
    expect(postPageHref("ko", 1)).toBe("/posts/");
    expect(postPageHref("ko", 2)).toBe("/posts/2/");
    expect(postPageHref("en", 1)).toBe("/en/posts/");
    expect(postPageHref("en", 2)).toBe("/en/posts/2/");
  });

  it("links translations by TranslationKey instead of slug", () => {
    const route = buildPostRouteData(posts, "ko").find(
      entry => entry.post.data.translationKey === "shared"
    );

    expect(route?.languageHref).toBe(
      "/en/posts/translated-with-another-slug/"
    );
    expect(route?.alternates).toEqual([
      { locale: "ko", href: "/posts/old-korean/" },
      {
        locale: "en",
        href: "/en/posts/translated-with-another-slug/",
      },
    ]);
    expect(route?.xDefaultHref).toBe("/posts/old-korean/");
  });

  it("falls back to the target Posts list without a false hreflang", () => {
    const [route] = buildPostRouteData(posts, "ko");

    expect(route.post.data.translationKey).toBe("korean-only");
    expect(route.languageHref).toBe("/en/posts/");
    expect(route.alternates).toEqual([
      { locale: "ko", href: "/posts/recent-korean/" },
    ]);
    expect(route.prevPost).toBeNull();
    expect(route.nextPost?.data.locale).toBe("ko");
  });

  it("builds dynamic OG routes only for the requested locale and missing custom images", () => {
    const customImage = {
      ...posts[0],
      data: { ...posts[0].data, ogImage: "custom.png" },
    } as CollectionEntry<"posts">;

    expect(
      getPostOgRouteDataFrom([customImage, ...posts.slice(1)], "ko").map(
        entry => entry.slug
      )
    ).toEqual(["recent-korean"]);
    expect(getPostOgRouteDataFrom(posts, "en").map(entry => entry.slug)).toEqual([
      "translated-with-another-slug",
    ]);
  });
});
