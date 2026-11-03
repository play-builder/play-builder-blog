# Play Builder 한국어·영어 다국어 콘텐츠 설계

## 목차

- [1. 목표와 최종 결과](#1-목표와-최종-결과)
- [2. 현재 상태와 제약](#2-현재-상태와-제약)
- [3. 선택한 접근 방식](#3-선택한-접근-방식)
- [4. URL과 Locale 규칙](#4-url과-locale-규칙)
- [5. 콘텐츠 모델](#5-콘텐츠-모델)
- [6. 검증과 게시 규칙](#6-검증과-게시-규칙)
- [7. 생성 파일 구조](#7-생성-파일-구조)
- [8. 애플리케이션 구성 요소](#8-애플리케이션-구성-요소)
- [9. 언어 전환 동작](#9-언어-전환-동작)
- [10. 공통 UI와 정적 페이지 번역](#10-공통-ui와-정적-페이지-번역)
- [11. SEO, 검색, RSS와 Sitemap](#11-seo-검색-rss와-sitemap)
- [12. 작성·게시·배포 흐름](#12-작성게시배포-흐름)
- [13. 오류 처리와 롤백](#13-오류-처리와-롤백)
- [14. TDD와 검증 전략](#14-tdd와-검증-전략)
- [15. 데이터 마이그레이션](#15-데이터-마이그레이션)
- [16. 비목표](#16-비목표)
- [17. 완료 기준](#17-완료-기준)

## 1. 목표와 최종 결과

**핵심 요약:** Play Builder를 한국어 기본, 영어 선택형 정적 사이트로 확장한다. Tech Blog, Course, Lesson은 Locale별로 독립 게시하며, 같은 콘텐츠의 번역본은 `TranslationKey`로 연결한다.

최종 사용자 관점의 결과는 다음과 같다.

- 한국어는 locale prefix가 없는 기본 사이트로 제공한다.
- 영어는 `/en/` prefix 아래에서 제공한다.
- Header 우측 상단에 `KR | EN | Theme` 탐색을 제공한다.
- 한국어 화면에는 한국어로 게시된 콘텐츠만 표시한다.
- 영어 화면에는 영어로 게시된 콘텐츠만 표시한다.
- 번역 상세 페이지가 있으면 언어 전환 시 해당 번역본으로 이동한다.
- 번역 상세 페이지가 없으면 대상 언어의 Posts 또는 Courses 목록으로 이동한다.
- Pagefind 검색, SEO metadata, RSS와 Sitemap도 Locale별로 분리한다.
- Notion 게시 버튼은 한 번의 Production 빌드로 두 Locale의 현재 `Published` 콘텐츠를 함께 배포한다.

## 2. 현재 상태와 제약

**핵심 요약:** 저장소는 Astro 6 정적 사이트이며 i18n helper 사용 흔적은 있지만 locale 설정은 `en` 하나뿐이다. Notion 동기화 결과와 Tech Blog 컬렉션에는 아직 언어 구분이 없고, 기존 테마 변경은 미커밋 상태로 보존해야 한다.

현재 확인된 상태는 다음과 같다.

- Astro 설정: `locales: ["en"]`, `defaultLocale: "en"`
- Site language: `en`
- Tech Blog: `src/content/posts`의 단일 컬렉션
- Notion 생성 Course: `generated-notion/courses/{slug}.json`
- Notion 생성 Lesson: `generated-notion/lessons/{courseSlug}/{lessonSlug}.md`
- Course와 Lesson의 동일 Slug 번역본은 현재 생성 경로가 충돌한다.
- Pagefind 빌드는 현재 `en` 한 언어만 발견한다.
- Header, Breadcrumb, Footer 일부는 Astro i18n helper를 이미 사용한다.
- Course 화면과 Home에는 영어 하드코딩 문구가 남아 있다.
- `/admin/*`와 Publish API는 현재 동작을 유지해야 한다.
- GitHub 원격 push는 사용자가 직접 수행한다.

Cloudflare Pages 배포는 정적 산출물을 제공한다. 이 설계는 요청 시 콘텐츠를 번역하거나 Notion을 조회하는 runtime 계층을 추가하지 않는다.

## 3. 선택한 접근 방식

**핵심 요약:** Locale 필드로 콘텐츠를 분리하고, 화면 렌더러는 공유하며, 한국어 루트와 영어 `/en/` 정적 라우트를 별도로 생성한다. 정적 배포, SEO, 검색 분리와 유지보수성을 함께 충족하는 방식이다.

### 3.1 채택: 공유 렌더러와 Locale별 정적 라우트

- root page tree는 기본 Locale `ko`를 렌더링한다.
- `/en/` page tree는 `en` 콘텐츠를 렌더링한다.
- page wrapper는 얇게 유지하고 데이터 선택과 UI는 공통 모듈·컴포넌트로 공유한다.
- 콘텐츠 컬렉션은 `locale`과 `translationKey`를 필수 계약으로 사용한다.
- URL prefix와 `<html lang>`이 서버 상태나 `localStorage`가 아닌 현재 언어 상태의 원천이다.

Astro의 file-based i18n routing은 기본 언어 파일을 root page tree에 두고 비기본 언어 파일을 locale 디렉터리에 두는 구조를 지원한다. `prefixDefaultLocale: false`로 기본 언어 URL을 보존한다. 자세한 동작은 [Astro i18n routing 공식 문서](https://docs.astro.build/en/guides/internationalization/)를 기준으로 한다.

### 3.2 제외: 언어별 페이지 전체 복제

한국어와 영어의 Astro 페이지 구현을 완전히 복제하지 않는다. 기능 수정 시 두 구현이 달라지고 테스트·접근성·SEO 로직이 분기되는 문제를 피하기 위해서다.

### 3.3 제외: 클라이언트 언어 필터

한 URL에 두 언어 콘텐츠를 포함하고 JavaScript로 숨기는 방식은 제외한다.

- 언어별 canonical URL을 제공하지 못한다.
- 검색엔진과 Pagefind 색인이 섞인다.
- 모든 방문자에게 두 언어 payload를 전달한다.
- JavaScript 실패 시 잘못된 언어 콘텐츠가 노출될 수 있다.

## 4. URL과 Locale 규칙

**핵심 요약:** 한국어 기존 URL을 유지하고 영어에만 `/en/` prefix를 사용한다. Locale 내부 값은 ISO 언어 코드 `ko`, `en`으로 고정하고 Header 표시만 `KR`, `EN`을 사용한다.

Astro 설정은 다음과 같다.

```ts
i18n: {
  locales: ["ko", "en"],
  defaultLocale: "ko",
  routing: { prefixDefaultLocale: false },
}
```

| 콘텐츠 | 한국어 URL | 영어 URL |
|---|---|---|
| Home | `/` | `/en/` |
| Posts 목록 | `/posts/` | `/en/posts/` |
| Post 상세 | `/posts/{slug}/` | `/en/posts/{slug}/` |
| Courses 목록 | `/courses/` | `/en/courses/` |
| Course 상세 | `/courses/{courseSlug}/` | `/en/courses/{courseSlug}/` |
| Lesson 상세 | `/courses/{courseSlug}/{lessonSlug}/` | `/en/courses/{courseSlug}/{lessonSlug}/` |
| Search | `/search/` | `/en/search/` |
| Tags | `/tags/` | `/en/tags/` |
| Archives | `/archives/` | `/en/archives/` |
| About | `/about/` | `/en/about/` |
| RSS | `/rss.xml` | `/en/rss.xml` |

같은 번역쌍은 같은 Slug 사용을 권장하지만 필수는 아니다. 대응 콘텐츠 탐색은 Slug가 아니라 안정적인 `TranslationKey`를 사용한다.

## 5. 콘텐츠 모델

**핵심 요약:** Notion Course·Lesson과 Markdown Post가 공통으로 `locale`, `translationKey`를 가진다. 번역본은 별도 콘텐츠 레코드이며 한 레코드 안에 두 언어 필드를 혼합하지 않는다.

### 5.1 공통 Locale 타입

```ts
type ContentLocale = "ko" | "en";
```

`TranslationKey`는 소문자 kebab-case를 사용한다.

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

### 5.2 Notion Courses

기존 필드에 다음을 추가한다.

| 속성 | Notion 타입 | 규칙 |
|---|---|---|
| `Locale` | Select | 정확히 `ko` 또는 `en` |
| `TranslationKey` | Rich text | 번역쌍에서 동일한 lowercase kebab-case |

내부 Course 모델은 다음 필드를 포함한다.

```ts
type Course = {
  locale: ContentLocale;
  translationKey: string;
  // 기존 title, slug, description, order, status 등
};
```

### 5.3 Notion Lessons

내부 Lesson 모델도 같은 필드를 포함한다.

```ts
type Lesson = {
  locale: ContentLocale;
  translationKey: string;
  // 기존 title, slug, courseId, module, status 등
};
```

Lesson의 `Course` relation은 반드시 같은 Locale의 Course 한 개를 가리킨다.

### 5.4 Tech Blog Markdown

기존 한국어 Post frontmatter에 다음 값을 명시한다.

```yaml
locale: ko
translationKey: security-group-connection-tracking
```

영어 번역은 별도 Markdown 파일로 작성한다.

```yaml
locale: en
translationKey: security-group-connection-tracking
```

기존 한국어 파일은 현재 위치를 유지해 기존 URL과 상대 이미지 경로를 보존한다. 신규 영어 파일은 `src/content/posts/en/` 아래에 저장하고 URL helper가 저장 디렉터리의 `en` segment를 공개 Slug에서 제거한다.

## 6. 검증과 게시 규칙

**핵심 요약:** 잘못된 콘텐츠를 조용히 제외하지 않고 빌드를 실패시킨다. 단, 번역본 자체가 없는 것은 정상 상태이며 해당 Locale 목록 fallback으로 처리한다.

### 6.1 모든 Notion 행에 적용하는 검증

Notion 응답의 Course와 Lesson은 `Draft`를 포함해 모두 파싱·검증한다.

- `Locale`은 `ko` 또는 `en`이어야 한다.
- `TranslationKey`는 비어 있지 않고 lowercase kebab-case여야 한다.
- 기존 필수 Title, Slug, Description, Status, 순서, Relation을 만족해야 한다.
- 같은 Locale 안에서 Course Slug는 고유해야 한다.
- 같은 Locale 안에서 Course TranslationKey는 고유해야 한다.
- 같은 Course와 Locale 안에서 Lesson Slug는 고유해야 한다.
- 같은 Locale 안에서 Lesson TranslationKey는 고유해야 한다.
- Lesson과 Course의 Locale은 같아야 한다.

같은 TranslationKey가 `ko`와 `en`에 각각 한 번 존재하는 것은 정상이다. 번역본이 한 Locale에만 존재하는 것도 정상이다.

### 6.2 공개 조건

- Course는 자신의 Status가 `Published`일 때 해당 Locale 목록에 공개한다.
- Lesson은 자신과 부모 Course가 모두 `Published`일 때 공개한다.
- `Draft`, `Archived` 콘텐츠는 해당 Locale 산출물에서 제외한다.
- 한 Locale의 게시 상태는 다른 Locale의 공개 여부에 영향을 주지 않는다.

## 7. 생성 파일 구조

**핵심 요약:** Locale을 생성 경로에 포함해 동일 Slug 번역본의 충돌을 제거한다. 생성 트리는 staging 디렉터리에서 완성된 후 원자적으로 교체하는 기존 전략을 유지한다.

```text
src/content/generated-notion/
├─ courses/
│  ├─ ko/
│  │  └─ aws-certified-cloudops-engineer-associate.json
│  └─ en/
│     └─ aws-certified-cloudops-engineer-associate.json
└─ lessons/
   ├─ ko/
   │  └─ aws-certified-cloudops-engineer-associate/
   │     └─ s3-cross-account-replication.md
   └─ en/
      └─ aws-certified-cloudops-engineer-associate/
         └─ s3-cross-account-replication.md
```

Course JSON과 Lesson frontmatter에는 `locale`, `translationKey`를 기록한다. Astro content loader는 다음 패턴을 사용한다.

```text
courses/**/*.json
lessons/**/*.md
```

## 8. 애플리케이션 구성 요소

**핵심 요약:** 데이터 선택, 번역 연결, URL 생성과 화면 렌더링을 각각 분리한다. Locale wrapper는 route 등록만 담당하고 콘텐츠 로직을 중복하지 않는다.

### 8.1 Locale utility

역할:

- 지원 Locale 판별과 기본값 제공
- 현재 URL에서 Locale 제거·추가
- Locale별 Posts, Courses, Lessons 필터
- TranslationKey로 대응 번역 검색
- 상세 번역이 없을 때 목록 fallback URL 반환

### 8.2 Shared page renderers

다음 화면은 Locale을 명시적인 입력으로 받아 공통 렌더링한다.

- Home
- Posts 목록과 상세
- Courses 목록, Course 상세, Lesson 상세
- Tags와 Archives
- Search
- About와 404

root pages는 `ko`, `/en/` wrapper pages는 `en`을 전달한다. Dynamic route의 `getStaticPaths()`도 Locale별 컬렉션만 사용한다.

### 8.3 Header language navigation

Header는 `locale`과 `alternateUrl`을 입력받는다.

- 목록·정적 페이지는 경로 기반 대응 URL을 사용한다.
- 상세 페이지는 TranslationKey로 찾은 대응 URL을 사용한다.
- 대응 상세가 없으면 Posts 또는 Courses 목록 URL을 사용한다.
- 현재 언어 링크에 `aria-current="page"`를 설정한다.
- mobile navigation에서도 같은 동작을 제공한다.

### 8.4 기존 Admin

`/admin/`, `/admin/publish/`, `/admin/api/publish`는 locale routing 대상에서 제외한다. Cloudflare Access 인증, JWT 검증, Deploy Hook과 응답 계약을 변경하지 않는다.

## 9. 언어 전환 동작

**핵심 요약:** Header의 언어 제어는 client-side 상태 토글이 아니라 정적 URL link다. URL이 locale 상태의 유일한 원천이므로 새로고침, 공유, 검색엔진과 브라우저 탐색이 일관된다.

| 현재 페이지 | 대응 번역 있음 | 대응 번역 없음 |
|---|---|---|
| Home | 대상 Locale Home | 항상 존재 |
| Posts 목록 | 대상 Locale 목록 | 항상 존재 |
| Post 상세 | TranslationKey가 같은 Post | 대상 Locale Posts 목록 |
| Courses 목록 | 대상 Locale 목록 | 항상 존재 |
| Course 상세 | TranslationKey가 같은 Course | 대상 Locale Courses 목록 |
| Lesson 상세 | TranslationKey가 같은 Lesson | 대상 Locale Courses 목록 |
| Search | 대상 Locale Search | 항상 존재 |
| Tags/Archives | 대상 Locale 목록 | 항상 존재 |
| About | 대상 Locale About | 항상 존재 |

미번역 상세 URL을 추측해 404 링크를 만들지 않는다. 언어 선택을 `localStorage`에 저장하거나 브라우저 언어로 자동 redirect하지 않는다.

## 10. 공통 UI와 정적 페이지 번역

**핵심 요약:** 콘텐츠뿐 아니라 navigation과 화면 레이블도 Locale에 맞게 제공한다. Admin은 운영자 UI이므로 기존 영어를 유지한다.

`src/i18n/lang/ko.ts`를 추가하고 UI translation fallback을 `ko`로 변경한다. 다음 문구를 번역 테이블로 이동한다.

- Header navigation과 언어·테마 접근성 label
- Home hero, 최근 Posts, 공개 Courses, CTA
- Posts, Courses, Curriculum, Lesson과 예상 시간
- Breadcrumb와 이전·다음 탐색
- Tags, Archives, Search와 Pagination
- Footer, 공유 링크, 404

About는 Locale별 콘텐츠 문서를 제공한다. 현재 정적 About의 영어 본문은 영어 버전으로 사용하고, 같은 의미의 한국어 문서를 추가한다.

## 11. SEO, 검색, RSS와 Sitemap

**핵심 요약:** 각 정적 페이지가 정확한 language metadata와 canonical을 가진다. 존재하는 번역본에만 alternate를 제공하고 Pagefind는 `<html lang>` 기준으로 index를 분리한다.

### 11.1 HTML과 canonical

- 한국어 페이지: `<html lang="ko">`
- 영어 페이지: `<html lang="en">`
- canonical은 현재 Locale URL을 가리킨다.
- 목록과 정적 페이지는 `ko`, `en`, `x-default` alternate를 제공한다.
- 상세 페이지는 실제 Published 번역본이 있을 때만 상대 Locale alternate를 제공한다.
- `x-default`는 Published 한국어 대응 URL이 있으면 한국어 URL을 사용하고, 한국어 대응 URL이 없으면 현재 존재하는 상세 URL을 사용한다.

### 11.2 Pagefind

Pagefind는 빌드 후 `<html lang>`에 따라 언어별 index를 자동 생성하고 현재 검색 페이지 언어의 index를 사용한다. 한국어는 Pagefind extended build의 segmentation 지원을 사용한다. 자세한 동작은 [Pagefind multilingual search 공식 문서](https://pagefind.app/docs/multilingual/)를 기준으로 한다.

### 11.3 RSS와 Sitemap

- `/rss.xml`은 한국어 Published Post만 포함한다.
- `/en/rss.xml`은 영어 Published Post만 포함한다.
- Sitemap은 실제 생성된 한국어·영어 URL을 모두 포함한다.
- `/admin/*`는 기존처럼 Sitemap과 Pagefind에서 제외한다.

## 12. 작성·게시·배포 흐름

**핵심 요약:** 번역 콘텐츠는 별도 항목으로 작성하고 Locale별 Status를 독립 관리한다. Publish는 특정 Locale이 아니라 현재 두 Locale의 Published snapshot을 하나의 정적 배포로 만든다.

```mermaid
flowchart LR
    A[Notion Course/Lesson<br/>Locale + TranslationKey] --> B[Build-time sync]
    C[Markdown Posts<br/>Locale + TranslationKey] --> D[Astro collections]
    B --> D
    D --> E{Locale filter}
    E -->|ko| F[Root static routes]
    E -->|en| G[/en static routes]
    F --> H[Pagefind ko index]
    G --> I[Pagefind en index]
    H --> J[Cloudflare Pages deployment]
    I --> J
```

이 그림에서 봐야 할 핵심은 Notion과 Markdown이 먼저 공통 Locale 계약으로 정규화되고, 그 뒤에 한국어와 영어 정적 라우트·검색 index로 분리된다는 점이다.

운영 순서는 다음과 같다.

1. 작성자가 Locale별 Course, Lesson, Post를 작성한다.
2. 공개할 Locale 콘텐츠의 Status를 `Published`로 변경한다.
3. 관리자가 `/admin/publish/`에서 Production build를 요청한다.
4. 빌드는 모든 Notion 행을 검증한다.
5. Locale별 Published 콘텐츠와 정적 라우트를 생성한다.
6. 테스트·Astro build·Pagefind가 성공하면 새 Production 배포가 활성화된다.
7. 실패하면 이전 Production 배포가 유지된다.

## 13. 오류 처리와 롤백

**핵심 요약:** 데이터 오류는 정확한 Course/Lesson 식별자와 함께 빌드를 중단한다. 기존 Production을 부분 업데이트하지 않으며 코드 롤백 시 Notion의 추가 속성은 이전 코드에서 무시된다.

빌드를 중단하는 오류는 다음과 같다.

- 누락되거나 지원하지 않는 Locale
- 누락되거나 잘못된 TranslationKey
- 동일 Locale의 Slug 또는 TranslationKey 중복
- Lesson과 Course의 Locale 불일치
- 기존 필수 Notion 속성·Relation·순서 오류
- 동일 출력 경로 충돌
- Notion API, Markdown, asset download 실패
- Astro schema, route 또는 Pagefind build 실패

번역본 부재는 오류가 아니다. 언어 전환 시 목록 fallback으로 처리한다.

롤백 전략은 다음과 같다.

- Cloudflare Pages에서 이전 성공 Production deployment를 복구할 수 있다.
- 코드 롤백 시 `Locale`, `TranslationKey` Notion 속성은 데이터로 남지만 이전 parser가 무시한다.
- 영어 Course와 Lesson을 `Draft`로 전환하면 다음 배포에서 영어 콘텐츠만 제거된다.
- 생성 디렉터리는 staging 후 전체 교체하므로 실패 중간 결과를 사용하지 않는다.

## 14. TDD와 검증 전략

**핵심 요약:** 모델, 동기화, 컬렉션, 라우팅, 언어 전환, SEO와 검색을 작은 RED-GREEN-REFACTOR 사이클로 구현한다. 정적 fixture 검증과 실제 Cloudflare/Notion 검증의 증거 수준을 구분한다.

### 14.1 TDD 순서

1. Notion Locale·TranslationKey parser와 validation
2. Locale별 publication selection과 relation invariant
3. Locale별 생성 파일 경로와 충돌 방지
4. Astro content schema와 fixture migration
5. Post locale filtering과 TranslationKey lookup
6. Course catalog locale filtering
7. 한국어 root와 영어 `/en/` route generation
8. Header alternate URL과 fallback
9. UI translation, canonical과 hreflang
10. Pagefind, RSS, Tags, Archives와 Sitemap

각 production 동작은 먼저 실패 테스트를 실행해 의도한 이유로 실패하는 것을 확인한 뒤 최소 구현으로 통과시킨다.

### 14.2 자동 검증

```bash
pnpm test
pnpm lint
pnpm format:check
pnpm build:fixture
git diff --check
```

fixture build 산출물에서 다음을 검증한다.

- root 한국어와 `/en/` 영어 URL 생성
- Locale별 목록·상세 데이터 격리
- 동일 Slug 번역본의 경로 충돌 부재
- 미번역 상세의 목록 fallback URL
- `<html lang>`, canonical, hreflang
- Pagefind가 `ko`, `en` 두 언어를 발견함
- 한국어·영어 RSS 분리
- 기존 Admin auth/publish와 theme 테스트 회귀 없음

### 14.3 검증 한계

`build:fixture` 성공은 고정 Notion fixture와 로컬 정적 산출물의 증거다. 실제 Production Notion Data Source, Cloudflare secret, Deploy Hook, Access와 live domain 동작은 사용자가 배포한 뒤 별도로 확인한다. 로컬 fixture 결과를 live 배포 완료로 표현하지 않는다.

## 15. 데이터 마이그레이션

**핵심 요약:** 기존 한국어 URL과 이미지 참조를 보존하면서 언어 metadata를 추가한다. Notion 데이터는 사용자가 이미 준비했으며 구현 중 fixture와 parser를 그 계약에 맞춘다.

마이그레이션 순서는 다음과 같다.

1. 기존 Tech Blog Post에 `locale: ko`를 추가한다.
2. 각 Post에 현재 Slug 기반 `translationKey`를 추가한다.
3. 영어 Post 저장 디렉터리와 작성 예시를 문서화한다.
4. Notion fixture에 `ko/en` Course와 Lesson 번역쌍을 추가한다.
5. Course와 Lesson 생성 경로를 Locale 디렉터리로 전환한다.
6. Astro 기본 Locale을 `ko`로 변경한다.
7. 영어 wrapper routes와 한국어 UI 번역을 추가한다.
8. 전체 fixture build에서 이전 한국어 URL이 그대로 생성되는지 확인한다.

기존 Post 파일을 `ko/` 하위로 대량 이동하지 않는다. 현재 상대 이미지 경로와 Git history, 기존 URL에 불필요한 위험을 만들기 때문이다.

## 16. 비목표

**핵심 요약:** 첫 구현은 명시적으로 작성된 번역 콘텐츠를 정확하게 제공하는 데 집중한다. 자동 번역, runtime locale detection과 CMS 구조 변경은 포함하지 않는다.

다음은 이번 범위에 포함하지 않는다.

- Tech Blog 또는 Notion 본문의 자동 번역
- 브라우저 언어 기반 자동 redirect
- Locale 선택을 cookie 또는 localStorage에 저장
- Notion Webhook 기반 자동 게시
- 번역 진행률 UI
- 세 번째 Locale
- Admin UI 번역
- 기존 Cloudflare Access·Deploy Hook 정책 변경
- 기존 콘텐츠 문체·기술 내용의 광범위한 교정

## 17. 완료 기준

**핵심 요약:** 한국어 기존 URL을 보존하면서 영어 정적 URL, Locale별 데이터·검색·SEO가 검증되고 기존 Admin와 theme 회귀가 없어야 한다. 자동 검증과 live 운영 검증을 별도 기준으로 관리한다.

코드 구현 완료 기준은 다음과 같다.

- `ko`, `en` Notion Course·Lesson이 충돌 없이 동기화된다.
- 모든 기존 한국어 Post가 root 한국어 경로에 유지된다.
- 영어 자료가 있는 콘텐츠만 `/en/` 상세 URL을 생성한다.
- 모든 목록·상세·Tags·Archives·검색·RSS가 Locale별로 분리된다.
- Header `KR | EN | Theme`가 desktop과 mobile에서 동작한다.
- 번역이 있으면 대응 상세, 없으면 대상 Locale 목록으로 이동한다.
- UI 문구, `<html lang>`, canonical, hreflang이 Locale과 일치한다.
- Pagefind build가 `ko`, `en` index를 생성한다.
- 모든 자동 테스트, lint, format, fixture build와 diff check가 통과한다.
- 기존 Admin publish와 dark-first theme 테스트가 통과한다.
- 원격 push를 수행하지 않고 사용자가 검토·배포할 수 있는 로컬 변경으로 전달한다.

운영 완료 기준은 사용자의 Cloudflare Pages 배포 후 별도로 확인한다.

- 실제 Notion Production sync 성공
- Production deployment 성공
- `blog.playbuilder.xyz`의 한국어·영어 URL 응답
- Cloudflare Access로 보호된 Admin publish 유지
- 실제 Pagefind 언어별 검색 결과
