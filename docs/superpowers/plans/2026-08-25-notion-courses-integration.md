# Notion Courses Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 Notion의 Courses/Lessons 데이터베이스 페이지를 수동 Publish 시점에만 `blog.playbuilder.xyz/courses/*` 정적 페이지로 배포하고, 관리자 게시 화면을 Cloudflare Access와 애플리케이션 검증으로 보호한다.

**Architecture:** Cloudflare Pages 빌드가 Notion API를 읽어 전용 generated content/assets 디렉터리를 만든 뒤 Astro가 정적 HTML을 생성한다. `/admin/publish/`는 Pages Function이 Access JWT, hostname, origin, source IP를 검증한 뒤 서버 측에서 Deploy Hook을 호출하며, Notion 저장 자체는 배포를 시작하지 않는다.

**Tech Stack:** Astro 6.4.2, TypeScript 6, Node.js >=22.12, pnpm, Vitest 4.1.11, `jose` 6.2.10, `yaml` 2.9.0, Cloudflare Pages Functions, Notion API `2026-03-11`

**Spec:** `docs/superpowers/specs/2026-08-25-notion-courses-integration-design.md`

## Global Constraints

- 기존 `/posts/*` URL과 Markdown 작성 흐름을 변경하지 않는다.
- 강의 URL은 `/courses/`, `/courses/{courseSlug}/`, `/courses/{courseSlug}/{lessonSlug}/`이다.
- Course와 Lesson이 모두 `Status=Published`일 때만 배포 대상이다.
- Notion 페이지는 Public web으로 전환하지 않고 Internal Integration에만 공유한다.
- Notion 저장은 배포를 시작하지 않으며 `/admin/publish/`의 명시적 요청만 Production Deploy Hook을 호출한다.
- `NOTION_TOKEN`과 `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`을 파일, 로그, 브라우저 응답에 노출하지 않는다.
- `/admin`과 `/admin/*`는 Cloudflare Access Allow 정책과 Pages Function 검증을 모두 통과해야 한다.
- generated 정리는 `src/content/generated-notion`과 `public/notion-assets`만 대상으로 한다.
- 실제 Notion/Cloudflare 계정 연결 전에는 fixture/static 검증으로 표시하며 live 배포 검증으로 표현하지 않는다.
- GitHub 원격 푸시는 사용자가 직접 수행한다.

---

## File Map

| 경로 | 책임 |
|---|---|
| `src/notion/model.ts` | Course/Lesson 도메인 타입, Notion 속성 정규화, 공개 필터, 정렬, 관계 검증 |
| `src/notion/client.ts` | Notion Data Source pagination과 page Markdown 조회 |
| `src/notion/assets.ts` | 원격 이미지 URL/크기/type 검증과 안정적 로컬 자산 경로 생성 |
| `src/notion/sync.ts` | API·정규화·자산 수집·generated 파일 원자적 교체 조합 |
| `scripts/sync-notion.ts` | live/disabled/fixture 실행 모드 CLI |
| `src/content/generated-notion/` | 빌드 때만 생성되는 Course JSON과 Lesson Markdown |
| `public/notion-assets/` | 빌드 때만 생성되는 Notion 이미지 |
| `src/courses/catalog.ts` | Astro content entry를 Course/Module/Lesson 탐색 모델로 구성 |
| `src/pages/courses/**` | 목록, 과정, 레슨 정적 페이지 |
| `src/admin/auth.ts` | Access JWT, hostname, origin, IP 검증 |
| `src/admin/publish.ts` | Deploy Hook 호출 use case와 안전한 응답 |
| `functions/admin/_middleware.ts` | 모든 `/admin/*` 요청의 runtime 보호 |
| `functions/admin/api/publish.ts` | POST publish endpoint |
| `src/pages/admin/**` | 관리자 publish UI와 `/admin` redirect |
| `docs/notion-cloudflare-course-publishing.md` | Notion/Pages/Access 연결과 운영 runbook |

## Task 1: Test Runner와 Course/Lesson 도메인 계약

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `tests/notion/model.test.ts`
- Create: `src/notion/model.ts`

**Interfaces:**

- Produces: `parseCoursePage(page: unknown): Course`, `parseLessonPage(page: unknown): Lesson`, `selectPublishedContent(courses: Course[], lessons: Lesson[]): Publication`.
- `Course.slug`는 전역 kebab-case, `Lesson.slug`는 course 내부 kebab-case이며 관계가 없거나 중복이면 `NotionValidationError`를 던진다.

- [ ] **Step 1: 테스트 도구를 설치하고 실패 테스트를 작성한다.**

```bash
pnpm add yaml@2.9.0 jose@6.2.10
pnpm add -D vitest@4.1.11 tsx@4.23.12 @cloudflare/workers-types@5.20260825.1
```

```ts
// tests/notion/model.test.ts 핵심 계약
expect(parseCoursePage(publishedCourseFixture)).toMatchObject({
  title: "Ethereum Validator Operations",
  slug: "ethereum-validator-operations",
  status: "Published",
});
expect(() => parseCoursePage(courseWithSlug("Bad Slug"))).toThrow(/kebab-case/);
expect(selectPublishedContent([publishedCourse], [draftLesson]).lessons).toEqual([]);
expect(() => selectPublishedContent([publishedCourse], [lessonForMissingCourse])).toThrow(
  /unknown course/
);
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm test -- tests/notion/model.test.ts`

Expected: `Cannot find module '@/notion/model'`로 FAIL.

- [ ] **Step 3: Notion 공식 응답 형태를 읽는 최소 정규화 코드를 구현한다.**

```ts
export type PublicationStatus = "Draft" | "Published" | "Archived";
export type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  order: number;
  status: PublicationStatus;
  tags: string[];
  coverUrl?: string;
  lastEditedTime: string;
};
export type Lesson = {
  id: string;
  title: string;
  slug: string;
  description: string;
  courseId: string;
  module: string;
  moduleOrder: number;
  lessonOrder: number;
  status: PublicationStatus;
  estimatedMinutes?: number;
  tags: string[];
  lastEditedTime: string;
  markdown?: string;
};
export type Publication = { courses: Course[]; lessons: Lesson[] };
```

필수 property type을 확인하고, literal title/rich_text/status/select/relation/multi_select/files를 정규화한다. 정렬은 Course `order,title`, Lesson `moduleOrder,lessonOrder,title` 순서다.

- [ ] **Step 4: GREEN과 전체 회귀를 확인한다.**

Run: `pnpm test -- tests/notion/model.test.ts && pnpm test`

Expected: 모든 model 테스트 PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/notion/model.test.ts src/notion/model.ts
git commit -m "feat: define notion course content model"
```

## Task 2: Notion 읽기 Client

**Files:**

- Create: `tests/notion/client.test.ts`
- Create: `src/notion/client.ts`

**Interfaces:**

- Consumes: Task 1의 Notion page 정규화 입력.
- Produces: `NotionReadClient.queryDataSource(id: string): Promise<unknown[]>`, `retrievePageMarkdown(pageId: string): Promise<string>`.
- 생성자는 `{ token, fetchImpl?, baseUrl? }`를 받고 모든 요청에 `Authorization`, `Content-Type`, `Notion-Version: 2026-03-11`을 넣는다.

- [ ] **Step 1: pagination, header, 오류 계약 실패 테스트를 작성한다.**

```ts
const client = new NotionReadClient({ token: "test-token", fetchImpl });
expect(await client.queryDataSource("courses-source")).toHaveLength(2);
expect(requests[1].body).toContain('"start_cursor":"next-1"');
expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
await expect(client.retrievePageMarkdown("lesson-1")).rejects.toThrow(
  /retrieve page markdown.*lesson-1.*429/
);
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm test -- tests/notion/client.test.ts`

Expected: `NotionReadClient` export 부재로 FAIL.

- [ ] **Step 3: native fetch 기반 client를 구현한다.**

`POST /v1/data_sources/{id}/query`의 `has_more`가 false일 때까지 cursor를 전송하고, `GET /v1/pages/{pageId}/markdown`의 `markdown` 문자열을 반환한다. non-2xx는 token/response body를 포함하지 않는 `NotionApiError(operation, resourceId, status)`로 변환한다.

- [ ] **Step 4: GREEN을 확인한다.**

Run: `pnpm test -- tests/notion/client.test.ts && pnpm test`

Expected: pagination과 오류 테스트 PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add tests/notion/client.test.ts src/notion/client.ts
git commit -m "feat: read notion data sources"
```

## Task 3: Notion 자산 수집 보안 경계

**Files:**

- Create: `tests/notion/assets.test.ts`
- Create: `src/notion/assets.ts`

**Interfaces:**

- Produces: `validateAssetUrl(raw: string): URL`, `ingestAsset(input: AssetInput, deps: AssetDependencies): Promise<IngestedAsset>`.
- `AssetInput={pageId,blockId,url}`, 결과는 `{publicPath,outputPath,sha256,bytes}`.
- 허용: public HTTPS, `image/png|jpeg|webp|gif|svg+xml`, 최대 `10 MiB`.
- 거부: HTTP, credentials, localhost, `.local`, loopback, link-local, RFC1918 IPv4, unique-local/link-local IPv6.

- [ ] **Step 1: URL/Content-Type/크기/경로 실패 테스트를 작성한다.**

```ts
expect(() => validateAssetUrl("http://example.com/a.png")).toThrow(/HTTPS/);
expect(() => validateAssetUrl("https://127.0.0.1/a.png")).toThrow(/public host/);
await expect(ingestAsset(largeImage, deps)).rejects.toThrow(/10 MiB/);
expect(result.publicPath).toBe("/notion-assets/page-1/block-1-<hash>.png");
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm test -- tests/notion/assets.test.ts`

Expected: assets module 부재로 FAIL.

- [ ] **Step 3: streaming 대신 제한된 ArrayBuffer 다운로드와 안정 경로 생성을 구현한다.**

다운로드 전 `Content-Length`, 다운로드 후 실제 byte 수를 모두 검사한다. `crypto.subtle.digest('SHA-256', bytes)`의 앞 16 hex를 사용하고 `writeFile` 의존성은 주입하여 테스트가 실제 파일시스템을 요구하지 않게 한다.

- [ ] **Step 4: GREEN을 확인한다.**

Run: `pnpm test -- tests/notion/assets.test.ts && pnpm test`

Expected: SSRF/size/type/안정 경로 테스트 PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add tests/notion/assets.test.ts src/notion/assets.ts
git commit -m "feat: ingest notion assets safely"
```

## Task 4: 원자적 Notion Sync와 Fixture 모드

**Files:**

- Create: `tests/fixtures/notion/courses.json`
- Create: `tests/fixtures/notion/lessons.json`
- Create: `tests/fixtures/notion/lesson-markdown.json`
- Create: `tests/notion/sync.test.ts`
- Create: `src/notion/sync.ts`
- Create: `scripts/sync-notion.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**

- Produces: `syncNotionCourses(config: SyncConfig, deps: SyncDependencies): Promise<SyncSummary>`.
- `SyncSummary={publishedCourses,publishedLessons,excludedCourses,excludedLessons}`.
- CLI modes: disabled (`NOTION_SYNC_ENABLED`가 `true`가 아님), live (`true`), fixture (`--fixture`).

- [ ] **Step 1: 실패 시 기존 출력 보존, 성공 시 교체, fixture 결과 테스트를 작성한다.**

```ts
await expect(syncNotionCourses(config, failingDeps)).rejects.toThrow(/lesson-2/);
expect(fsSnapshot.existingOutput).toBe("unchanged");
expect(summary).toEqual({
  publishedCourses: 1,
  publishedLessons: 2,
  excludedCourses: 1,
  excludedLessons: 1,
});
expect(generatedLessonFrontmatter).toContain('courseSlug: "ethereum-validator-operations"');
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm test -- tests/notion/sync.test.ts`

Expected: sync module 부재로 FAIL.

- [ ] **Step 3: stage 디렉터리 생성 후 성공할 때만 exact target을 교체하는 sync를 구현한다.**

Course는 `src/content/generated-notion/courses/{slug}.json`, Lesson은 `src/content/generated-notion/lessons/{courseSlug}/{slug}.md`로 쓴다. YAML은 `yaml.stringify`로 생성하고 Markdown API 결과의 frontmatter 경계를 안전하게 분리한다. live mode에서는 세 Notion 환경 변수가 하나라도 없으면 non-zero로 종료한다.

- [ ] **Step 4: CLI와 GREEN을 확인한다.**

Run: `pnpm test -- tests/notion/sync.test.ts && pnpm sync:notion:fixture`

Expected: 테스트 PASS, fixture summary `1 course, 2 lessons` 출력.

- [ ] **Step 5: 커밋한다.**

```bash
git add .gitignore package.json tests/fixtures/notion tests/notion/sync.test.ts src/notion/sync.ts scripts/sync-notion.ts
git commit -m "feat: generate notion course content"
```

## Task 5: Astro Content Collection과 Course Catalog

**Files:**

- Modify: `src/content.config.ts`
- Create: `tests/courses/catalog.test.ts`
- Create: `src/courses/catalog.ts`

**Interfaces:**

- Consumes: generated `courses` JSON와 `lessons` Markdown collection entries.
- Produces: `buildCourseCatalog(courses, lessons): CourseCatalog[]`; 각 catalog는 정렬된 `{name,order,lessons}` module 목록과 이전/다음 lesson을 계산한다.

- [ ] **Step 1: module grouping, 정렬, orphan 거부 실패 테스트를 작성한다.**

```ts
expect(catalog[0].modules.map(module => module.name)).toEqual(["Setup", "Operations"]);
expect(catalog[0].modules[0].lessons.map(lesson => lesson.slug)).toEqual(["install", "verify"]);
expect(catalog[0].lessonNavigation["verify"]).toEqual({ previous: "install", next: "monitor" });
expect(() => buildCourseCatalog(courses, orphanLessons)).toThrow(/unknown course/);
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm test -- tests/courses/catalog.test.ts`

Expected: catalog module 부재로 FAIL.

- [ ] **Step 3: schema와 순수 catalog builder를 구현한다.**

`courses`와 `lessons` collection은 generated 경로의 `glob()` loader를 사용한다. `lastEditedTime`은 ISO datetime, order는 non-negative integer, slug는 model과 같은 regex로 schema 검증한다.

- [ ] **Step 4: GREEN과 Astro schema를 확인한다.**

Run: `pnpm test -- tests/courses/catalog.test.ts && pnpm astro sync`

Expected: 테스트 PASS, Astro content type generation 성공.

- [ ] **Step 5: 커밋한다.**

```bash
git add src/content.config.ts tests/courses/catalog.test.ts src/courses/catalog.ts
git commit -m "feat: build course navigation catalog"
```

## Task 6: Course 정적 UI

**Files:**

- Create: `src/components/courses/CourseCard.astro`
- Create: `src/components/courses/CourseSidebar.astro`
- Create: `src/components/courses/LessonNavigation.astro`
- Create: `src/pages/courses/index.astro`
- Create: `src/pages/courses/[course].astro`
- Create: `src/pages/courses/[course]/[lesson].astro`
- Create: `tests/courses/pages.test.ts`

**Interfaces:**

- Consumes: Task 5 catalog and Astro `render()` for Lesson Markdown.
- Produces: 정적 course/lesson URL, breadcrumb, module sidebar, 현재 lesson, 이전/다음 탐색, Pagefind metadata.

- [ ] **Step 1: fixture build 결과를 대상으로 사용자 관찰 가능한 HTML 실패 테스트를 작성한다.**

```ts
expect(courseListHtml).toContain('href="/courses/ethereum-validator-operations/"');
expect(courseHtml).toContain("Setup");
expect(lessonHtml).toContain('aria-current="page"');
expect(lessonHtml).toContain('data-pagefind-filter="content:course"');
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm build:fixture && pnpm test -- tests/courses/pages.test.ts`

Expected: `/courses` 출력 파일 부재로 FAIL.

- [ ] **Step 3: 공통 Layout을 재사용하는 최소 페이지와 컴포넌트를 구현한다.**

Course 목록은 description/tags/module·lesson count/update date를 노출한다. Lesson은 mobile에서 sidebar를 `<details>`로 접고 desktop에서 고정 탐색을 제공한다. 본문에는 `data-pagefind-body`, content/course filter metadata를 설정한다.

- [ ] **Step 4: GREEN을 확인한다.**

Run: `pnpm build:fixture && pnpm test -- tests/courses/pages.test.ts`

Expected: 세 URL HTML 테스트 PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add src/components/courses src/pages/courses tests/courses/pages.test.ts
git commit -m "feat: render course learning pages"
```

## Task 7: 통합 탐색, Home, SEO

**Files:**

- Modify: `src/components/Header.astro`
- Modify: `src/components/Footer.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/robots.txt.ts`
- Modify: `src/i18n/types.ts`
- Modify: `src/i18n/lang/en.ts`
- Modify: `astro-paper.config.ts`
- Modify: `astro.config.ts`
- Create: `tests/site/navigation.test.ts`

**Interfaces:**

- Produces: `Home | Tech Posts | Courses | About | Search`, canonical `https://blog.playbuilder.xyz`, `/admin/` robots/sitemap/search 제외.

- [ ] **Step 1: 빌드 HTML과 robots/sitemap을 검증하는 실패 테스트를 작성한다.**

```ts
expect(homeHtml).toContain('href="/posts/"');
expect(homeHtml).toContain('href="/courses/"');
expect(homeHtml).toContain("Latest Tech Posts");
expect(robots).toContain("Disallow: /admin/");
expect(homeHtml).toContain('<link rel="canonical" href="https://blog.playbuilder.xyz/">');
expect(sitemap).not.toContain("/admin/");
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm build:fixture && pnpm test -- tests/site/navigation.test.ts`

Expected: Courses navigation/canonical/robots assertion FAIL.

- [ ] **Step 3: 탐색과 홈을 수정한다.**

상단 Tags/Archives를 제거하고 Footer에서 유지한다. Home에는 Tech Posts와 Courses 진입 카드, 최근 posts, 공개 courses, `https://playbuilder.xyz` 프로필 링크를 배치한다. sitemap filter는 `/admin` 경로를 제외하고 site URL을 custom domain으로 변경한다.

- [ ] **Step 4: GREEN을 확인한다.**

Run: `pnpm build:fixture && pnpm test -- tests/site/navigation.test.ts`

Expected: navigation/SEO 테스트 PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add src/components/Header.astro src/components/Footer.astro src/pages/index.astro src/pages/robots.txt.ts src/i18n src/config.ts astro-paper.config.ts astro.config.ts tests/site/navigation.test.ts
git commit -m "feat: integrate tech and course navigation"
```

## Task 8: 관리자 Authorization과 Deploy Hook Use Case

**Files:**

- Create: `tests/admin/auth.test.ts`
- Create: `tests/admin/publish.test.ts`
- Create: `src/admin/auth.ts`
- Create: `src/admin/publish.ts`

**Interfaces:**

- Produces: `authorizeAdminRequest(request, env, verifyJwt): Promise<AdminIdentity>`, `handlePublishRequest(request, env, deps): Promise<Response>`.
- 환경: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ADMIN_ALLOWED_IPS`, `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`.
- JWT adapter는 `jose.createRemoteJWKSet(new URL('https://{team}/cdn-cgi/access/certs'))`와 `jwtVerify`로 issuer/audience/expiry를 검증한다.

- [ ] **Step 1: hostname/origin/IP/JWT/method/hook 오류 실패 테스트를 작성한다.**

```ts
await expect(authorizeAdminRequest(pagesDevRequest, env, verifyJwt)).rejects.toMatchObject({ status: 403 });
await expect(authorizeAdminRequest(wrongIpRequest, env, verifyJwt)).rejects.toMatchObject({ status: 403 });
expect((await handlePublishRequest(getRequest, env, deps)).status).toBe(405);
expect((await handlePublishRequest(validRequest, env, failingHook)).status).toBe(502);
expect(await successfulResponse.json()).toEqual({ status: "deployment_requested" });
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm test -- tests/admin/auth.test.ts tests/admin/publish.test.ts`

Expected: admin modules 부재로 FAIL.

- [ ] **Step 3: deny-by-default authorization과 hook 호출을 구현한다.**

허용 hostname/origin은 `https://blog.playbuilder.xyz`, IP는 comma-separated exact IPv4/IPv6, token은 `Cf-Access-Jwt-Assertion`만 사용한다. 응답에는 hook URL, token, upstream body를 포함하지 않고 `Cache-Control: no-store`를 설정한다.

- [ ] **Step 4: GREEN을 확인한다.**

Run: `pnpm test -- tests/admin/auth.test.ts tests/admin/publish.test.ts && pnpm test`

Expected: 모든 허용/거부 branch PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add tests/admin src/admin
git commit -m "feat: authorize course publishing"
```

## Task 9: Pages Functions와 Publish UI

**Files:**

- Create: `functions/admin/_middleware.ts`
- Create: `functions/admin/api/publish.ts`
- Create: `functions/tsconfig.json`
- Create: `src/pages/admin/index.astro`
- Create: `src/pages/admin/publish.astro`
- Create: `tests/admin/ui.test.ts`

**Interfaces:**

- Consumes: Task 8 authorization/use case.
- Produces: `/admin` redirect, protected `/admin/publish/`, POST `/admin/api/publish`.

- [ ] **Step 1: Admin UI의 confirm·POST·status 계약 실패 테스트를 작성한다.**

```ts
expect(adminHtml).toContain('action="/admin/api/publish"');
expect(adminHtml).toContain("Publish current Notion content");
expect(adminHtml).toContain("deployment_requested");
expect(adminHtml).toContain("Cloudflare Pages Deployments");
```

- [ ] **Step 2: RED를 확인한다.**

Run: `pnpm build:fixture && pnpm test -- tests/admin/ui.test.ts`

Expected: admin HTML 부재로 FAIL.

- [ ] **Step 3: middleware, endpoint, 점진적 향상 UI를 구현한다.**

middleware는 `/admin/*`의 GET/POST 모두 Task 8 authorization을 통과해야 `next()` 한다. UI는 button 클릭 후 `window.confirm`, fetch POST, `deployment_requested`를 “요청 접수, 배포 완료 아님”으로 표시하고 Cloudflare Dashboard 확인 링크를 제공한다. JS가 없어도 form POST가 동작하도록 endpoint는 JSON/303 응답을 Accept header로 구분한다.

- [ ] **Step 4: GREEN과 Functions typecheck를 확인한다.**

Run: `pnpm build:fixture && pnpm test -- tests/admin/ui.test.ts && pnpm exec tsc -p functions/tsconfig.json --noEmit`

Expected: admin UI 테스트와 Functions typecheck PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add functions src/pages/admin tests/admin/ui.test.ts
git commit -m "feat: add protected publish console"
```

## Task 10: CI, 운영 Runbook, 전체 검증

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/notion-cloudflare-course-publishing.md`

**Interfaces:**

- Produces: CI `test → lint → format → fixture build`, 사용자가 그대로 수행할 수 있는 Notion/Cloudflare 연결과 게시/롤백 절차.

- [ ] **Step 1: package scripts를 실제로 실행하는 CI regression을 추가한다.**

CI 순서는 `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build:fixture`로 고정한다. 기본 `pnpm build`는 `NOTION_SYNC_ENABLED!=true`일 때 Notion을 호출하지 않고 empty generated directory로 빌드하며, Production은 Pages variable을 `true`로 설정한다.

- [ ] **Step 2: 운영 문서를 작성한다.**

문서에 다음 실제 절차와 정상/실패 결과를 모두 기록한다.

1. 개인 Notion workspace에 Courses와 Lessons database 생성 및 설계서 property type 설정.
2. Notion Internal Integration을 read-only로 생성하고 두 database에서 `... → Add connections`로 공유.
3. 각 database의 `Manage data sources → Copy data source ID` 값을 복사.
4. Cloudflare Pages Production build secrets에 `NOTION_TOKEN`, 두 data source ID, `NOTION_SYNC_ENABLED=true` 설정.
5. Pages `Settings → Builds & deployments → Deploy hooks`에서 Production/main hook 생성 후 Functions secret으로 저장.
6. Zero Trust Self-hosted application에 exact `/admin`, wildcard `/admin/*` 두 path 설정.
7. Allow policy를 `Include: 관리자 email`, `Require: 고정 공인 IP /32 또는 /128`, `Require: MFA`로 설정하고 Bypass를 만들지 않음.
8. Access application AUD, team domain, exact IP를 Functions secrets/vars로 설정.
9. Notion에서 Course/Lesson을 Published로 바꾼 뒤 `/admin/publish/` 접속, Publish, Pages deployment 성공, 운영 URL 확인.
10. 빌드 실패 시 이전 Production 유지 확인, Pages 로그 확인, secret 회전, 이전 deployment rollback 절차.

- [ ] **Step 3: 문서/설정 format과 비밀값 누출 scan을 실행한다.**

Run: `node_modules/.bin/prettier --check . && rg -n "secret_[A-Za-z0-9]|https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/[A-Za-z0-9]" --glob '!pnpm-lock.yaml' .`

Expected: Prettier PASS, secret scan 출력 없음.

- [ ] **Step 4: 최종 검증을 새로 실행한다.**

Run: `pnpm test && pnpm lint && pnpm format:check && pnpm build:fixture && pnpm build && pnpm exec tsc -p functions/tsconfig.json --noEmit`

Expected: 모든 명령 exit 0. `dist/courses/**`, `dist/admin/publish/index.html`, Pagefind, sitemap 생성. live Notion fetch와 실제 Deploy Hook 호출은 계정 secret 설정 후 별도 검증 대상으로 남는다.

- [ ] **Step 5: 변경 범위와 커밋을 확인한다.**

```bash
git status --short
git diff --check
git log --oneline --decorate -12
git add .github/workflows/ci.yml .env.example README.md docs/notion-cloudflare-course-publishing.md
git commit -m "docs: add notion publishing runbook"
```

## Plan Self-Review

- 설계의 URL, 수동 Publish, build-time sync, Notion private sharing, 자산 수집, UI, Access/IP/JWT 방어, 실패 시 이전 배포 유지, 관측성, TDD 요구사항은 Task 1~10에 대응한다.
- 미정 상태나 후속 구현으로 미루는 placeholder 문구를 사용하지 않았다.
- `Course`, `Lesson`, `Publication`, `SyncSummary`, `CourseCatalog`, `authorizeAdminRequest`, `handlePublishRequest` 이름은 생산자와 소비자 task에서 동일하다.
- 실제 계정 값이 필요한 Notion fetch, Access login, Deploy Hook, Production 전환은 fixture 검증과 구분하고 runbook의 사용자 후속 단계로 남긴다.
