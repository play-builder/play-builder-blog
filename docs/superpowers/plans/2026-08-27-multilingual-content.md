# Play Builder Multilingual Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve all existing Korean URLs while generating isolated Korean and English Tech Blog, Course, Lesson, search, SEO, RSS, and navigation experiences from explicit `Locale` and `TranslationKey` metadata.

**Architecture:** Normalize Notion and Markdown content to one `ContentLocale` contract, validate translation and relation invariants before publication, and write Notion output under locale-specific directories. Root Astro routes render Korean, thin `/en/` wrappers render English, and shared page components plus pure locale helpers prevent duplicated behavior.

**Tech Stack:** Astro 6.4, TypeScript 6, Astro Content Collections, Vitest 4, Pagefind 1.5, Notion API build-time sync, Tailwind CSS 4, Cloudflare Pages static hosting.

**Spec:** `docs/superpowers/specs/2026-08-27-multilingual-content-design.md`

## Global Constraints

- Supported content locales are exactly `ko` and `en`; `ko` is the default.
- Korean URLs remain unprefixed. English URLs use `/en/`.
- Existing Korean public URLs must not change.
- The URL is the locale source of truth. Do not use browser-language redirects or locale `localStorage`.
- A translation is a separate record joined by a lowercase kebab-case `TranslationKey`.
- Missing translations are valid. A language switch without a matching detail page falls back to the target locale's Posts or Courses list.
- Do not fabricate or machine-translate production English articles, courses, or lessons.
- `/admin/*`, Cloudflare Access, the Publish API, and the Deploy Hook remain outside locale routing.
- Preserve unrelated worktree changes. Commit the already-verified theme changes separately before multilingual work.
- Never print secrets or Notion/Cloudflare credentials.
- Never run `git push`, `git send-pack`, or GitHub ref-write APIs. The user performs all remote pushes.
- Every behavior change follows RED → GREEN → focused regression → local commit.
- `build:fixture` proves deterministic local static generation only; it does not prove a live Notion sync or Cloudflare production deployment.

## Task 0: Preserve the Existing Theme Baseline

**Files:**

- Modify: `src/components/Header.astro`
- Modify: `src/i18n/lang/en.ts`
- Modify: `src/i18n/types.ts`
- Modify: `src/layouts/Layout.astro`
- Modify: `src/scripts/theme.ts`
- Modify: `tests/site/theme.test.ts`

- [ ] **Step 1: Confirm the theme-only dirty boundary**

Run:

```bash
git status --short
git diff -- src/components/Header.astro src/i18n/lang/en.ts src/i18n/types.ts src/layouts/Layout.astro src/scripts/theme.ts tests/site/theme.test.ts
```

Expected: only the six listed theme files are modified. Stop if another pre-existing file overlaps this boundary.

- [ ] **Step 2: Re-run the focused theme contract**

Run:

```bash
pnpm test tests/site/theme.test.ts
```

Expected: six theme tests pass, including dark-first default, persistence, invalid-value fallback, accessible action labels, and explicit-preference precedence.

- [ ] **Step 3: Commit only the theme files locally**

```bash
git add src/components/Header.astro src/i18n/lang/en.ts src/i18n/types.ts src/layouts/Layout.astro src/scripts/theme.ts tests/site/theme.test.ts
git diff --cached --check
git commit -m "feat: harden dark-first theme toggle"
```

Expected: one local commit; no remote write.

- [ ] **Step 4: Confirm the implementation baseline**

```bash
git status --short
git log -2 --oneline
```

Expected: clean worktree and the theme commit immediately above design commit `b289a69`.

## Task 1: Add the Shared Locale Contract and Parse Notion Metadata

**Files:**

- Create: `src/i18n/locales.ts`
- Create: `tests/i18n/locales.test.ts`
- Modify: `src/notion/model.ts`
- Modify: `tests/notion/model.test.ts`

**Public interface:**

```ts
export const CONTENT_LOCALES = ["ko", "en"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export const DEFAULT_LOCALE: ContentLocale = "ko";
export const TRANSLATION_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isContentLocale(value: unknown): value is ContentLocale;
export function otherLocale(locale: ContentLocale): ContentLocale;
```

- [ ] **Step 1: Write failing locale utility tests**

Add assertions that:

- supported locales are exactly `ko`, `en`;
- the default is `ko`;
- `isContentLocale` rejects `kr`, uppercase values, empty values, and non-strings;
- `otherLocale("ko")` returns `en` and vice versa;
- the translation-key pattern accepts `aws-cloudops-s3` and rejects spaces, uppercase characters, underscores, and leading/trailing hyphens.

Run:

```bash
pnpm test tests/i18n/locales.test.ts
```

Expected RED: the new module does not exist.

- [ ] **Step 2: Implement the pure locale contract**

Create `src/i18n/locales.ts` with only deterministic constants and functions. Do not import Astro runtime APIs.

Run:

```bash
pnpm test tests/i18n/locales.test.ts
```

Expected GREEN: all locale utility tests pass.

- [ ] **Step 3: Extend the Notion parser tests**

Update Course and Lesson builders in `tests/notion/model.test.ts` to provide:

```ts
Locale: { type: "select", select: { name: "ko" } },
TranslationKey: {
  type: "rich_text",
  rich_text: [{ plain_text: "aws-cloudops-s3" }],
},
```

Add failing assertions for:

- parsed Course and Lesson expose `locale` and `translationKey`;
- missing or unsupported Locale throws with the page identifier;
- empty or invalid TranslationKey throws with the property name;
- Draft rows are still parsed and validated.

Run:

```bash
pnpm test tests/notion/model.test.ts
```

Expected RED: current models omit the new fields and do not enforce the contract.

- [ ] **Step 4: Implement strict Notion metadata parsing**

Add to the internal Course and Lesson types:

```ts
locale: ContentLocale;
translationKey: string;
```

Parse `Locale` as a Notion Select and `TranslationKey` as Rich text. Validate all retrieved rows before applying `Published` filters.

Run:

```bash
pnpm test tests/notion/model.test.ts tests/i18n/locales.test.ts
```

Expected GREEN: locale contract and Notion parser tests pass.

- [ ] **Step 5: Commit locally**

```bash
git add src/i18n/locales.ts tests/i18n/locales.test.ts src/notion/model.ts tests/notion/model.test.ts
git diff --cached --check
git commit -m "feat: parse localized Notion content"
```

## Task 2: Enforce Translation and Relation Invariants Before Publication

**Files:**

- Modify: `src/notion/model.ts`
- Modify: `tests/notion/model.test.ts`

**Public interface:**

```ts
export function validateLocalizedContent(
  courses: readonly Course[],
  lessons: readonly Lesson[]
): void;
```

- [ ] **Step 1: Write failing invariant tests**

Cover these cases with human-readable error assertions:

- duplicate Course slug in one locale fails;
- duplicate Course `translationKey` in one locale fails;
- duplicate Lesson slug within the same Course and locale fails;
- duplicate Lesson `translationKey` in one locale fails;
- Lesson related to a Course in a different locale fails;
- Lesson related to no Course or multiple Courses fails;
- the same `translationKey` once in `ko` and once in `en` succeeds;
- a key present in only one locale succeeds;
- invalid Draft rows fail before publication filtering.

Run:

```bash
pnpm test tests/notion/model.test.ts
```

Expected RED: localized cross-row invariants are not implemented.

- [ ] **Step 2: Implement deterministic validation**

Use scoped keys rather than global slug uniqueness:

```ts
`${course.locale}:${course.slug}`
`${course.locale}:${course.translationKey}`
`${lesson.locale}:${lesson.courseId}:${lesson.slug}`
`${lesson.locale}:${lesson.translationKey}`
```

Resolve Course relations from the complete Course set, compare `lesson.locale` to `course.locale`, and throw before selecting published rows.

- [ ] **Step 3: Verify model regression**

```bash
pnpm test tests/notion/model.test.ts tests/notion/sync.test.ts
```

Expected GREEN: all new invariants and prior publish-selection behavior pass.

- [ ] **Step 4: Commit locally**

```bash
git add src/notion/model.ts tests/notion/model.test.ts
git diff --cached --check
git commit -m "feat: validate localized Notion relations"
```

## Task 3: Write Notion Output into Locale-Specific Paths

**Files:**

- Modify: `src/notion/sync.ts`
- Modify: `tests/notion/sync.test.ts`
- Modify: `tests/fixtures/notion/courses.json`
- Modify: `tests/fixtures/notion/lessons.json`
- Modify: `tests/fixtures/notion/lesson-markdown.json`

**Output contract:**

```text
src/content/generated-notion/courses/{locale}/{courseSlug}.json
src/content/generated-notion/lessons/{locale}/{courseSlug}/{lessonSlug}.md
```

- [ ] **Step 1: Expand the deterministic fixture**

Define fixture rows with stable identifiers:

- `course-ko` and `course-en`: Published, same translation key and slug;
- `course-draft`: Draft;
- `lesson-ko-1`, `lesson-ko-2`, `lesson-en-1`, `lesson-en-2`: Published;
- `lesson-draft`: Draft;
- locale-matching Course relations for every Lesson.

Keep all IDs, paths, and timestamps deterministic so snapshot-free assertions remain stable.

- [ ] **Step 2: Write failing sync path and metadata tests**

Assert:

- summary reports two published Courses and four published Lessons;
- Draft Course and Lesson are excluded;
- Korean and English files with the same slug coexist;
- Course JSON contains `locale` and `translationKey`;
- Lesson frontmatter contains `locale` and `translationKey`;
- old unscoped output paths are absent;
- staging replacement removes stale files.

Run:

```bash
pnpm test tests/notion/sync.test.ts
```

Expected RED: current output paths omit locale segments.

- [ ] **Step 3: Implement locale-scoped output**

Build paths only from validated model values. Keep the existing staging-directory and replace-on-success strategy. Do not add generated fixture output to Git.

- [ ] **Step 4: Verify sync and disabled-build behavior**

```bash
pnpm test tests/notion/sync.test.ts tests/notion/model.test.ts
pnpm verify:disabled-build
```

Expected GREEN: locale output and the safe disabled-sync behavior both pass.

- [ ] **Step 5: Commit locally**

```bash
git add src/notion/sync.ts tests/notion/sync.test.ts tests/fixtures/notion/courses.json tests/fixtures/notion/lessons.json tests/fixtures/notion/lesson-markdown.json
git diff --cached --check
git commit -m "feat: scope Notion output by locale"
```

## Task 4: Add Locale-Aware Content Schemas and Collection Helpers

**Files:**

- Create: `src/content/localized.ts`
- Create: `tests/content/localized.test.ts`
- Modify: `src/content.config.ts`
- Modify: `src/courses/catalog.ts`
- Modify: `tests/courses/catalog.test.ts`

**Public interface:**

```ts
export function filterByLocale<T extends { data: { locale: ContentLocale } }>(
  entries: readonly T[],
  locale: ContentLocale
): T[];

export function findTranslation<
  T extends { data: { locale: ContentLocale; translationKey: string } },
>(
  entries: readonly T[],
  translationKey: string,
  targetLocale: ContentLocale
): T | undefined;
```

- [ ] **Step 1: Write failing pure helper tests**

Test stable input ordering, exact locale matching, matching by both key and target locale, missing translation returning `undefined`, and non-mutation of input arrays.

Run:

```bash
pnpm test tests/content/localized.test.ts
```

Expected RED: `src/content/localized.ts` does not exist.

- [ ] **Step 2: Implement pure collection helpers**

Keep the helpers independent of Astro collection loaders so they can be unit tested with minimal records.

- [ ] **Step 3: Write failing Course and Lesson schema tests**

Update test records in `tests/courses/catalog.test.ts` to include locale metadata. Add assertions that the catalog is constructed only from already locale-filtered Courses and Lessons and rejects cross-locale mismatches defensively.

Change loader patterns in a failing state:

```ts
courses: glob({ pattern: "courses/**/*.json", base: generatedNotionRoot }),
lessons: glob({ pattern: "lessons/**/*.md", base: generatedNotionRoot }),
```

Run:

```bash
pnpm test tests/content/localized.test.ts tests/courses/catalog.test.ts
pnpm astro sync --force
```

Expected RED before implementation: schemas/catalog do not accept or enforce locale metadata.

- [ ] **Step 4: Add Course and Lesson schema fields**

Add required fields to the Course and Lesson schemas only:

```ts
locale: z.enum(CONTENT_LOCALES),
translationKey: z.string().regex(TRANSLATION_KEY_PATTERN),
```

Do not require Post metadata in this task; all Posts are migrated atomically in Task 5.

- [ ] **Step 5: Verify the focused content layer**

```bash
pnpm test tests/content/localized.test.ts tests/courses/catalog.test.ts tests/notion/sync.test.ts
pnpm sync:notion:fixture
pnpm astro sync --force
```

Expected GREEN: fixture-generated locale directories load, and content types are generated successfully. Generated fixture files remain untracked.

- [ ] **Step 6: Commit locally**

```bash
git add src/content/localized.ts tests/content/localized.test.ts src/content.config.ts src/courses/catalog.ts tests/courses/catalog.test.ts
git diff --cached --check
git commit -m "feat: add localized content collections"
```

## Task 5: Migrate Existing Tech Posts Without Changing Korean URLs

**Files:**

- Modify: `src/content.config.ts`
- Modify: `src/utils/getPostPaths.ts`
- Create: `tests/posts/paths.test.ts`
- Create: `src/content/posts/en/_README.md`
- Modify: `src/content/posts/autoscaling-log-preservation-lifecycle-hook-ssm.md`
- Modify: `src/content/posts/aws-kms-encryption-context-ethereum-seed.md`
- Modify: `src/content/posts/aws-ssm-session-manager-no-bastion.md`
- Modify: `src/content/posts/bastion-to-aws-ssm-evolution.md`
- Modify: `src/content/posts/container-linux-capabilities-drop-root.md`
- Modify: `src/content/posts/kinesis-enhanced-fan-out.md`
- Modify: `src/content/posts/kinesis-hot-shard-split-aggregate.md`
- Modify: `src/content/posts/kinesis-iterator-age-monitoring.md`
- Modify: `src/content/posts/link-local-address-169-254-169-254.md`
- Modify: `src/content/posts/security-group-connection-tracking.md`
- Modify: `src/content/posts/solana-node-infra-beyond-major-clouds.md`

- [ ] **Step 1: Write failing Post path tests**

Cover:

- a root Korean file ID produces its existing slug unchanged;
- `en/security-group-connection-tracking` produces public slug `security-group-connection-tracking`;
- only a leading content-relative `en/` segment is stripped;
- embedded words or nested directories named differently are preserved;
- locale is carried separately from slug generation.

Run:

```bash
pnpm test tests/posts/paths.test.ts
```

Expected RED: current path generation has no explicit locale contract.

- [ ] **Step 2: Add Post schema metadata and migrate all Korean Posts atomically**

Add required Post schema fields:

```ts
locale: z.enum(CONTENT_LOCALES),
translationKey: z.string().regex(TRANSLATION_KEY_PATTERN),
```

For every existing Post, add:

```yaml
locale: ko
translationKey: security-group-connection-tracking
```

The example above applies to `security-group-connection-tracking.md`. For each of the other ten files, use that file's literal existing public slug as its translation key. Do not move Korean files or modify their article bodies.

- [ ] **Step 3: Implement locale-segment-safe Post paths**

Refactor `getPostPaths` so storage path and public URL are separate concerns. Remove exactly one recognized leading locale segment (`en/`; tolerate `ko/` for future organization) from collection IDs before slug construction.

- [ ] **Step 4: Document English authoring without publishing fake content**

Create `src/content/posts/en/_README.md` as a non-collection authoring note explaining:

- English translation files live in this directory;
- their `translationKey` must equal the Korean source key;
- each translated body is written separately;
- Draft workflow is Git review, because Markdown Posts have no Notion Status field.

Configure the Post glob to exclude underscore-prefixed documentation so `_README.md` is never indexed as a Post.

- [ ] **Step 5: Verify schema, URLs, and existing Post regressions**

```bash
pnpm test tests/posts/paths.test.ts tests/site/navigation.test.ts
pnpm astro sync --force
```

Expected GREEN: all 11 Korean Posts validate and retain their current public slugs. No production English Post is created.

- [ ] **Step 6: Commit locally**

```bash
git add src/content.config.ts src/utils/getPostPaths.ts tests/posts/paths.test.ts src/content/posts/en/_README.md src/content/posts/*.md
git diff --cached --check
git commit -m "feat: add locale metadata to tech posts"
```

## Task 6: Make Korean the Default UI and Add URL/Translation Helpers

**Files:**

- Create: `src/i18n/lang/ko.ts`
- Create: `src/i18n/urls.ts`
- Create: `tests/i18n/urls.test.ts`
- Modify: `astro.config.ts`
- Modify: `astro-paper.config.ts`
- Modify: `src/i18n/index.ts`
- Modify: `src/i18n/types.ts`
- Modify: `src/i18n/lang/en.ts`
- Modify: `src/components/Header.astro`
- Modify: `src/layouts/Layout.astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `tests/site/navigation.test.ts`

**Public interface:**

```ts
export type ContentSection = "home" | "posts" | "courses" | "search" | "tags" | "archives" | "about";

export function localePrefix(locale: ContentLocale): "" | "/en";
export function localizedPath(locale: ContentLocale, path: string): string;
export function sectionPath(locale: ContentLocale, section: ContentSection): string;
export function detailPath(locale: ContentLocale, section: "posts" | "courses", ...slugs: string[]): string;
export function translationTarget(
  targetLocale: ContentLocale,
  matchingDetailPath: string | undefined,
  fallbackSection: "posts" | "courses"
): string;
```

- [ ] **Step 1: Write failing URL helper tests**

Assert exact trailing-slash behavior for all section paths, root Korean paths, `/en/` paths, Post/Course/Lesson detail paths, and missing-translation list fallback.

Run:

```bash
pnpm test tests/i18n/urls.test.ts
```

Expected RED: the helper module does not exist.

- [ ] **Step 2: Implement and verify pure URL helpers**

Normalize input path slashes in one place and never infer locale from translated display text.

```bash
pnpm test tests/i18n/urls.test.ts
```

Expected GREEN: every public URL table row from the design spec is covered.

- [ ] **Step 3: Write failing Korean-default and navigation tests**

Update `tests/site/navigation.test.ts` to require:

- Astro locales are `ko`, `en`, default `ko`, with unprefixed default routing;
- site language default is `ko`;
- Header exposes `KR` and `EN` links adjacent to the theme control;
- active language has `aria-current="page"`;
- Korean navigation links remain unprefixed;
- English navigation links stay under `/en/`;
- no browser-locale redirect or locale persistence script exists.

Run:

```bash
pnpm test tests/site/navigation.test.ts tests/i18n/urls.test.ts
```

Expected RED: configuration and Header still reflect the prior single-English setup.

- [ ] **Step 4: Complete the UI translation dictionaries**

Define every shared UI key in `src/i18n/types.ts`, then provide complete `ko` and `en` dictionaries. Include navigation, Home, Posts, Courses, Lessons, Tags, Archives, Search, About, RSS labels, empty states, pagination, breadcrumb labels, theme action labels, and missing-translation fallback text.

- [ ] **Step 5: Configure Astro and shared layouts**

Set:

```ts
i18n: {
  locales: ["ko", "en"],
  defaultLocale: "ko",
  routing: { prefixDefaultLocale: false },
}
```

Set the default site language to `ko`. Derive `<html lang>` from each page's explicit locale prop. Add canonical plus alternate-link props to `Layout.astro`:

```ts
type LocaleAlternate = { locale: ContentLocale; href: string };
```

Render `hreflang="ko"`, `hreflang="en"`, and `hreflang="x-default"` only for valid target URLs.

Keep two concepts separate:

- Header language target: may point to the target locale's list fallback when a detail translation is missing.
- SEO alternate: detail pages include the other locale only when the matching Published translation exists; never advertise a list fallback as a detail-page `hreflang` alternate.

For `x-default`, prefer the Published Korean detail URL, or use the current existing detail URL when no Korean translation exists.

- [ ] **Step 6: Implement the Header language switch**

Render `KR | EN` beside the existing theme button. Receive resolved target URLs from the page/layout; do not query all collections inside the Header. Preserve the current theme toggle accessibility and responsive behavior.

- [ ] **Step 7: Verify the shared shell**

```bash
pnpm test tests/i18n/urls.test.ts tests/site/navigation.test.ts tests/site/theme.test.ts tests/site/responsive-layout.test.ts
pnpm astro sync --force
pnpm astro check
```

Expected GREEN: Korean is the static default, English prefixing is deterministic, theme behavior remains intact, and Astro type checks pass.

- [ ] **Step 8: Commit locally**

```bash
git add astro.config.ts astro-paper.config.ts src/i18n src/components/Header.astro src/layouts/Layout.astro src/layouts/PostLayout.astro tests/i18n tests/site/navigation.test.ts
git diff --cached --check
git commit -m "feat: add Korean-default locale shell"
```

## Task 7: Generate Locale-Isolated Course and Lesson Routes

**Files:**

- Create: `src/courses/routes.ts`
- Create: `tests/courses/routes.test.ts`
- Create: `src/components/pages/CoursesPage.astro`
- Create: `src/components/pages/CoursePage.astro`
- Create: `src/components/pages/LessonPage.astro`
- Modify: `src/pages/courses/index.astro`
- Modify: `src/pages/courses/[course].astro`
- Modify: `src/pages/courses/[course]/[lesson].astro`
- Create: `src/pages/en/courses/index.astro`
- Create: `src/pages/en/courses/[course].astro`
- Create: `src/pages/en/courses/[course]/[lesson].astro`
- Modify: `src/components/courses/CourseCard.astro`
- Modify: `src/components/courses/CourseSidebar.astro`
- Modify: `src/components/courses/LessonNavigation.astro`
- Modify: `tests/courses/pages.test.ts`

**Route-data interface:**

```ts
export type CourseRouteData = {
  locale: ContentLocale;
  course: CollectionEntry<"courses">;
  lessons: CollectionEntry<"lessons">[];
  alternateHref: string;
};

export function getCourseRouteData(locale: ContentLocale): Promise<CourseRouteData[]>;
export function getLessonRouteData(locale: ContentLocale): Promise<LessonRouteData[]>;
```

- [ ] **Step 1: Write failing Course route-data tests**

Using in-memory locale-tagged records, assert:

- Korean route data contains only Korean Courses and Lessons;
- English route data contains only English Courses and Lessons;
- catalog filtering happens before grouping and sorting;
- paired Course and Lesson alternates are found by `translationKey`, not slug;
- absent Course translation falls back to target `/courses/` or `/en/courses/`;
- absent Lesson translation also falls back to the target Courses list;
- locale-mismatched relation cannot enter a route.

Run:

```bash
pnpm test tests/courses/routes.test.ts
```

Expected RED: Course route data is currently assembled inside page files without locale isolation.

- [ ] **Step 2: Implement the shared Course route-data layer**

Fetch each content collection once per build function, filter both collections by locale, build the catalog, and calculate alternates against the complete translated collections. Return serializable data to thin page wrappers.

- [ ] **Step 3: Write failing route-structure tests**

Update `tests/courses/pages.test.ts` to require:

- root and `/en/` wrappers exist for list, Course, and Lesson;
- wrappers pass literal `ko` or `en` into shared components;
- shared components own markup and translated labels;
- Course cards, sidebar, next/previous navigation, breadcrumbs, and back links use locale helpers;
- no page calls `getCollection` and then renders records from both locales together.

Run:

```bash
pnpm test tests/courses/pages.test.ts tests/courses/routes.test.ts
```

Expected RED: English wrappers and shared renderers do not exist.

- [ ] **Step 4: Extract shared Course page components**

Move existing UI into `CoursesPage.astro`, `CoursePage.astro`, and `LessonPage.astro`. Each component receives `locale`, route data, and resolved alternate URL. Translate all visible static strings through the dictionary; preserve Notion-authored titles, descriptions, and Markdown bodies verbatim.

- [ ] **Step 5: Make root and English wrappers thin**

Root wrappers bind `locale="ko"`; `/en/` wrappers bind `locale="en"`. Dynamic `getStaticPaths` must call the route-data layer for exactly one locale. Keep current Korean URL parameters unchanged.

- [ ] **Step 6: Verify static Course output**

```bash
pnpm test tests/courses/catalog.test.ts tests/courses/routes.test.ts tests/courses/pages.test.ts
pnpm build:fixture
```

Inspect:

```bash
find dist/courses dist/en/courses -type f -name index.html | sort
rg -n "lang=|hreflang=|/en/courses|No published|게시된" dist/courses dist/en/courses
```

Expected GREEN: both locale route trees exist, no locale content is mixed, and alternates/fallback links are rendered. This remains fixture-build evidence, not live Notion evidence.

- [ ] **Step 7: Commit locally**

```bash
git add src/courses/routes.ts tests/courses/routes.test.ts src/components/pages src/pages/courses src/pages/en/courses src/components/courses tests/courses/pages.test.ts
git diff --cached --check
git commit -m "feat: add localized course routes"
```

## Task 8: Generate Locale-Isolated Home, Posts List, and Post Detail Routes

**Files:**

- Create: `src/posts/routes.ts`
- Create: `tests/posts/routes.test.ts`
- Create: `src/components/pages/HomePage.astro`
- Create: `src/components/pages/PostsPage.astro`
- Create: `src/components/pages/PostPage.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/posts/[...page].astro`
- Modify: `src/pages/posts/[...slug]/index.astro`
- Create: `src/pages/en/index.astro`
- Create: `src/pages/en/posts/[...page].astro`
- Create: `src/pages/en/posts/[...slug]/index.astro`
- Modify: `src/components/Card.astro`
- Modify: `src/pages/posts/[...slug]/_components/AdjacentPostNav.astro`
- Modify: `src/pages/posts/[...slug]/_components/BackButton.astro`
- Modify: `src/pages/posts/[...slug]/_components/EditPost.astro`
- Modify: `src/pages/posts/[...slug]/_components/ShareLinks.astro`

**Route-data interface:**

```ts
export function getPostsForLocale(locale: ContentLocale): Promise<CollectionEntry<"posts">[]>;
export function getPostStaticPaths(locale: ContentLocale): Promise<AstroStaticPathsResult>;
export function getPostTranslationHref(
  post: CollectionEntry<"posts">,
  allPosts: readonly CollectionEntry<"posts">[],
  targetLocale: ContentLocale
): string;
```

- [ ] **Step 1: Write failing Post route-data tests**

Use test-only Korean and English records to assert locale filtering, stable date sorting, locale-prefixed pagination, exact translation matching by key, and Posts-list fallback when a translation is missing.

Run:

```bash
pnpm test tests/posts/routes.test.ts
```

Expected RED: no locale-specific Post route-data layer exists.

- [ ] **Step 2: Implement the Post route-data layer**

Keep pagination inputs locale-isolated. Preserve current slug/date/filter behavior after locale filtering. Never treat the English authoring README as content.

- [ ] **Step 3: Add failing page-structure assertions**

Require root and `/en/` Home/Posts/detail wrappers, shared page components, locale-aware cards, adjacent navigation, share URLs, edit links, back links, canonical URLs, and dictionary-backed empty states.

Run:

```bash
pnpm test tests/posts/routes.test.ts tests/site/navigation.test.ts
```

Expected RED: current pages and Post subcomponents hardcode root URLs or one language.

- [ ] **Step 4: Extract shared Home and Post page renderers**

The Home page must independently select recent Posts and Courses for its explicit locale. English Home may legitimately show empty Tech Posts until translations are authored; it must not fall back to Korean cards.

- [ ] **Step 5: Add thin root and English wrappers**

Preserve Korean routes exactly. Generate English Post routes only for English records. Pass resolved `locale`, canonical URL, and translation fallback target into the shared layout.

- [ ] **Step 6: Verify Post routing and static output**

```bash
pnpm test tests/posts/paths.test.ts tests/posts/routes.test.ts tests/site/navigation.test.ts
pnpm build:fixture
```

Inspect:

```bash
find dist/posts dist/en/posts -type f -name index.html | sort
rg -n "lang=\"ko\"|lang=\"en\"|hreflang=|/en/posts" dist/index.html dist/en/index.html dist/posts dist/en/posts
```

Expected GREEN: all existing Korean Post URLs still build, English pages do not contain Korean Post cards, and missing English translations link to `/en/posts/`.

- [ ] **Step 7: Commit locally**

```bash
git add src/posts/routes.ts tests/posts/routes.test.ts src/components/pages src/pages/index.astro src/pages/posts src/pages/en/index.astro src/pages/en/posts src/components/Card.astro
git diff --cached --check
git commit -m "feat: add localized tech blog routes"
```

## Task 9: Localize Secondary Pages, About, RSS, and Error UX

**Files:**

- Create: `src/components/pages/ArchivesPage.astro`
- Create: `src/components/pages/TagsPage.astro`
- Create: `src/components/pages/TagPage.astro`
- Create: `src/components/pages/SearchPage.astro`
- Create: `src/components/pages/AboutPage.astro`
- Create: `src/components/pages/NotFoundPage.astro`
- Modify: `src/pages/archives/index.astro`
- Modify: `src/pages/archives/_utils/getPostsByGroupCondition.ts`
- Modify: `src/pages/tags/index.astro`
- Modify: `src/pages/tags/[tag]/[...page].astro`
- Modify: `src/pages/search.astro`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/404.astro`
- Create: `src/pages/en/archives/index.astro`
- Create: `src/pages/en/tags/index.astro`
- Create: `src/pages/en/tags/[tag]/[...page].astro`
- Create: `src/pages/en/search.astro`
- Create: `src/pages/en/about.astro`
- Create: `src/pages/en/404.astro`
- Modify: `src/pages/rss.xml.ts`
- Create: `src/pages/en/rss.xml.ts`
- Modify: `src/content.config.ts`
- Delete: `src/content/pages/about.md`
- Create: `src/content/pages/about-ko.md`
- Create: `src/content/pages/about-en.md`
- Create: `tests/site/secondary-pages.test.ts`

- [ ] **Step 1: Write failing secondary-page tests**

Assert:

- Archives and Tags receive Posts already filtered by locale;
- tag counts and pagination never mix locales;
- search pages set explicit Pagefind locale filters;
- root About renders Korean content and `/en/about/` renders the existing English content;
- the 404 component uses the route locale and links to its locale Home;
- root RSS contains only Korean Posts and `/en/rss.xml` contains only English Posts;
- every RSS item uses a locale-correct absolute URL.

Run:

```bash
pnpm test tests/site/secondary-pages.test.ts
```

Expected RED: English secondary routes and locale filters do not exist.

- [ ] **Step 2: Split About content without losing the existing English copy**

Move the current `about.md` body verbatim to `about-en.md`. Author a faithful Korean counterpart in `about-ko.md`. Add required `locale` and `translationKey: about` metadata to the Pages schema and both files.

- [ ] **Step 3: Extract shared secondary-page components**

Each wrapper passes an explicit locale. Shared renderers use dictionaries for headings, empty states, input labels, pagination, and navigation while leaving tag values and authored content unchanged.

- [ ] **Step 4: Isolate Pagefind search by language**

Mark each locale page with Pagefind's language metadata and initialize search with the current locale. Do not combine result sets client-side. Korean Search must not return English documents and vice versa.

- [ ] **Step 5: Split RSS by locale**

Keep `/rss.xml` as Korean default and add `/en/rss.xml`. Reuse a locale-parameterized feed builder so metadata, item URLs, and content filters cannot diverge.

- [ ] **Step 6: Verify secondary routes**

```bash
pnpm test tests/site/secondary-pages.test.ts tests/posts/routes.test.ts
pnpm build:fixture
```

Inspect:

```bash
find dist/en -maxdepth 4 -type f \( -name index.html -o -name rss.xml \) | sort
rg -n "pagefind|data-pagefind-filter|hreflang|/en/rss.xml" dist/search/index.html dist/en/search/index.html dist/rss.xml dist/en/rss.xml
```

Expected GREEN: locale-isolated secondary pages and feeds are generated. The English feed may have zero items until English Posts are authored.

- [ ] **Step 7: Commit locally**

```bash
git add src/components/pages src/pages/archives src/pages/tags src/pages/search.astro src/pages/about.astro src/pages/404.astro src/pages/en src/pages/rss.xml.ts src/content.config.ts src/content/pages tests/site/secondary-pages.test.ts
git diff --cached --check
git commit -m "feat: localize secondary pages and feeds"
```

## Task 10: Verify Pagefind, Sitemap, Documentation, and Full Regression

**Files:**

- Create: `tests/site/multilingual-build.test.ts`
- Modify: `docs/notion-cloudflare-course-publishing.md`
- Modify: `README.md`
- Modify as required by failing tests only: `astro.config.ts`

- [ ] **Step 1: Write failing build-output contract tests**

Have the test read a completed fixture build and assert:

- `/`, `/en/`, `/courses/`, `/en/courses/`, `/posts/`, `/en/posts/` exist;
- existing Korean Post and Course URL shapes are preserved;
- `dist/pagefind` reports both `ko` and `en` indexes;
- Korean and English documents carry the correct language metadata;
- sitemap contains both locale trees;
- sitemap excludes `/admin`, `/admin/publish`, and `/admin/api/publish`;
- canonical and alternate links are absolute and point only to generated routes;
- detail-page `hreflang` never points to a list fallback;
- `/rss.xml` and `/en/rss.xml` both exist.

Run:

```bash
pnpm build:fixture
pnpm test tests/site/multilingual-build.test.ts
```

Expected RED: any remaining integration gap is now expressed as a concrete artifact assertion.

- [ ] **Step 2: Fix only observed integration gaps**

Adjust sitemap/i18n configuration or output metadata only where the failing artifact test proves a mismatch. Do not broaden scope into Cloudflare Access or runtime deployment changes.

- [ ] **Step 3: Update operator and author documentation**

In `docs/notion-cloudflare-course-publishing.md`, document:

- required `Locale` and `TranslationKey` Notion properties;
- same-locale Course relation rule;
- independent Course/Lesson `Published` behavior;
- one deploy publishes the current valid records of both locales;
- missing translation is allowed and switches to the target list;
- changing Published to Draft requires another deployment to remove static output;
- validation failures stop the build before replacing generated content.

In `README.md`, add the exact Markdown Post translation workflow and locale URL matrix. State that authors must translate each Post, Course, and Lesson body separately.

- [ ] **Step 4: Run the focused integration suite**

```bash
pnpm build:fixture
pnpm test tests/site/multilingual-build.test.ts tests/site/navigation.test.ts tests/site/secondary-pages.test.ts tests/courses/pages.test.ts tests/posts/routes.test.ts
```

Expected GREEN: artifact-level multilingual contracts pass against a freshly generated fixture build.

- [ ] **Step 5: Run the full local verification ceiling**

```bash
pnpm build:fixture
pnpm test
pnpm lint
pnpm format:check
pnpm build:fixture
pnpm test
git diff --check
git status --short
```

Expected:

- all Vitest tests pass both before and after the fresh build;
- ESLint and Prettier pass;
- Astro check/build and Pagefind finish successfully;
- only intended plan/implementation changes remain;
- generated Notion/Pagefind artifacts are not accidentally staged.

- [ ] **Step 6: Perform an explicit boundary review**

Run:

```bash
git diff b289a69..HEAD --stat
git log --oneline b289a69..HEAD
git status --short
```

Confirm:

- no `/admin/*`, auth, Access, or Deploy Hook behavior changed;
- no secrets entered Git;
- no production English content was invented;
- no remote write occurred;
- local fixture evidence is not described as live Cloudflare/Notion evidence.

- [ ] **Step 7: Commit final tests and documentation locally**

```bash
git add tests/site/multilingual-build.test.ts docs/notion-cloudflare-course-publishing.md README.md astro.config.ts
git diff --cached --check
git commit -m "test: verify multilingual static output"
```

If `astro.config.ts` did not change in Step 2, omit it from `git add`.

- [ ] **Step 8: Hand off user-only release commands**

Codex stops after local verification and commits. Report the commit list and verification ceiling. The user may then run:

```bash
git push origin main
```

After Cloudflare Pages completes, the user verifies live `/`, `/en/`, `/courses/`, `/en/courses/`, `/search/`, `/en/search/`, `/rss.xml`, and `/en/rss.xml`. Live results are a separate release verification step.
