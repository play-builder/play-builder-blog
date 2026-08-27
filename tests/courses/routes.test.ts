import { describe, expect, it } from "vitest";
import {
  buildCourseRouteData,
  buildLessonRouteData,
} from "@/courses/routes";
import type { CourseEntry, LessonEntry } from "@/courses/catalog";
import type { ContentLocale } from "@/i18n/locales";

const date = new Date("2026-08-25T06:00:00Z");

const course = (
  locale: ContentLocale,
  id: string,
  translationKey: string,
  slug: string,
  order = 1
): CourseEntry => ({
  id: `${locale}/${slug}`,
  data: {
    id,
    title: `${locale}-${slug}`,
    slug,
    description: `${locale}-${slug}`,
    locale,
    translationKey,
    order,
    tags: [],
    lastEditedTime: date,
  },
});

const lesson = (
  locale: ContentLocale,
  notionId: string,
  translationKey: string,
  courseId: string,
  courseSlug: string,
  slug: string,
  lessonOrder = 1
): LessonEntry => ({
  id: `${locale}/${courseSlug}/${slug}`,
  data: {
    notionId,
    title: `${locale}-${slug}`,
    slug,
    description: `${locale}-${slug}`,
    locale,
    translationKey,
    courseId,
    courseSlug,
    module: "S3",
    moduleOrder: 1,
    lessonOrder,
    tags: [],
    lastEditedTime: date,
  },
});

const courses = [
  course("ko", "course-ko", "aws-cloudops", "aws-cloudops"),
  course("en", "course-en", "aws-cloudops", "aws-cloudops"),
  course("ko", "course-ko-only", "korean-only", "korean-only", 2),
];

const lessons = [
  lesson("ko", "lesson-ko", "s3-replication", "course-ko", "aws-cloudops", "s3"),
  lesson("en", "lesson-en", "s3-replication", "course-en", "aws-cloudops", "s3"),
  lesson(
    "ko",
    "lesson-ko-only",
    "korean-only-lesson",
    "course-ko-only",
    "korean-only",
    "only-lesson"
  ),
];

describe("localized Course route data", () => {
  it("filters both Courses and Lessons before building each catalog", () => {
    const korean = buildCourseRouteData(courses, lessons, "ko");
    const english = buildCourseRouteData(courses, lessons, "en");

    expect(korean.map(route => route.catalog.course.data.locale)).toEqual([
      "ko",
      "ko",
    ]);
    expect(korean.flatMap(route => route.catalog.lessons)).toSatisfy(
      (entries: LessonEntry[]) =>
        entries.every(entry => entry.data.locale === "ko")
    );
    expect(english).toHaveLength(1);
    expect(english[0].catalog.lessons[0].data.locale).toBe("en");
  });

  it("links a translated Course by TranslationKey", () => {
    const [route] = buildCourseRouteData(courses, lessons, "ko");

    expect(route.languageHref).toBe("/en/courses/aws-cloudops/");
    expect(route.alternates).toEqual([
      { locale: "ko", href: "/courses/aws-cloudops/" },
      { locale: "en", href: "/en/courses/aws-cloudops/" },
    ]);
    expect(route.xDefaultHref).toBe("/courses/aws-cloudops/");
  });

  it("falls back to the target Courses list without advertising it as hreflang", () => {
    const route = buildCourseRouteData(courses, lessons, "ko")[1];

    expect(route.languageHref).toBe("/en/courses/");
    expect(route.alternates).toEqual([
      { locale: "ko", href: "/courses/korean-only/" },
    ]);
    expect(route.xDefaultHref).toBe("/courses/korean-only/");
  });

  it("links a translated Lesson and falls back when one is missing", () => {
    const routes = buildLessonRouteData(courses, lessons, "ko");

    expect(routes[0].languageHref).toBe("/en/courses/aws-cloudops/s3/");
    expect(routes[0].alternates).toEqual([
      { locale: "ko", href: "/courses/aws-cloudops/s3/" },
      { locale: "en", href: "/en/courses/aws-cloudops/s3/" },
    ]);
    expect(routes[1].languageHref).toBe("/en/courses/");
    expect(routes[1].alternates).toEqual([
      { locale: "ko", href: "/courses/korean-only/only-lesson/" },
    ]);
  });

  it("rejects a Lesson related to the translated Course record", () => {
    const mismatched = lesson(
      "ko",
      "lesson-mismatch",
      "mismatch",
      "course-en",
      "aws-cloudops",
      "mismatch"
    );

    expect(() => buildCourseRouteData(courses, [mismatched], "ko")).toThrow(
      /Lesson.*course-en.*Course.*course-ko/
    );
  });
});
