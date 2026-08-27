import rss from "@astrojs/rss";
import { useTranslations } from "@/i18n";
import type { ContentLocale } from "@/i18n/locales";
import { getPostsForLocale } from "@/posts/routes";
import { getPostUrl } from "@/utils/getPostPaths";
import config from "@/config";

export async function buildRss(locale: ContentLocale) {
  const posts = await getPostsForLocale(locale);
  const t = useTranslations(locale);

  return rss({
    title: `${config.site.title} - ${t.nav.posts}`,
    description: t.pages.postsDesc,
    site: config.site.url,
    items: posts.map(({ data, id, filePath }) => ({
      link: getPostUrl(id, filePath, locale),
      title: data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
  });
}
