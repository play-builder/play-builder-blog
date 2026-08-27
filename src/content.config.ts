import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";
import { localizedEntryId } from "@/content/localized";
import { CONTENT_LOCALES, TRANSLATION_KEY_PATTERN } from "@/i18n/locales";
import { BLOG_PATH } from "@/utils/getPostSlug";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const locale = z.enum(CONTENT_LOCALES);
const translationKey = z.string().regex(TRANSLATION_KEY_PATTERN);

const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(config.site.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default(["others"]),
      locale,
      translationKey,
      ogImage: image().or(z.string()).optional(),
      description: z.string(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    locale,
    translationKey,
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
  }),
});

const courses = defineCollection({
  loader: glob({
    pattern: "courses/**/*.json",
    base: "./src/content/generated-notion",
    generateId: ({ entry }) => localizedEntryId(entry, "courses"),
  }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    slug,
    description: z.string(),
    locale,
    translationKey,
    order: z.number().int().nonnegative(),
    status: z.literal("Published"),
    tags: z.array(z.string()),
    coverUrl: z.string().optional(),
    lastEditedTime: z.coerce.date(),
  }),
});

const lessons = defineCollection({
  loader: glob({
    pattern: "lessons/**/*.md",
    base: "./src/content/generated-notion",
    generateId: ({ entry }) => localizedEntryId(entry, "lessons"),
  }),
  schema: z.object({
    notionId: z.string(),
    title: z.string(),
    slug,
    description: z.string(),
    locale,
    translationKey,
    courseId: z.string(),
    courseSlug: slug,
    module: z.string(),
    moduleOrder: z.number().int().nonnegative(),
    lessonOrder: z.number().int().nonnegative(),
    estimatedMinutes: z.number().nonnegative().optional(),
    tags: z.array(z.string()),
    lastEditedTime: z.coerce.date(),
  }),
});

export const collections = { posts, pages, courses, lessons };
