import { isContentLocale } from "@/i18n/locales";
import { slugifyStr } from "./slugify";

export const BLOG_PATH = "src/content/posts";

function getPostPathSegments(filePath: string | undefined): string[] {
  const segments =
    filePath
      ?.replaceAll("\\", "/")
      .replace(BLOG_PATH, "")
      .split("/")
      .filter(path => path !== "")
      .filter(path => !path.startsWith("_"))
      .slice(0, -1)
      .map(segment => slugifyStr(segment)) ?? [];

  return segments[0] && isContentLocale(segments[0])
    ? segments.slice(1)
    : segments;
}

function getIdSlug(id: string): string {
  const postId = id.split("/");
  return postId.length > 0 ? String(postId[postId.length - 1]) : id;
}

export function getPostSlugPath(
  id: string,
  filePath: string | undefined
): string {
  const pathSegments = getPostPathSegments(filePath);
  const slug = getIdSlug(id);
  return pathSegments.length > 0
    ? [...pathSegments, slug].join("/")
    : String(slug);
}

export function getPostSlug(id: string, filePath: string | undefined): string {
  return `/${getPostSlugPath(id, filePath)}`;
}
