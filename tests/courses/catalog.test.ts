import { describe, expect, it } from "vitest";
import { buildCourseCatalog } from "@/courses/catalog";

const courses = [
  {
    id: "ethereum-validator-operations",
    data: {
      notionId: "course-1",
      title: "Ethereum Validator Operations",
      slug: "ethereum-validator-operations",
      description: "Operate validators safely",
      locale: "ko" as const,
      translationKey: "ethereum-validator-operations",
      order: 1,
      tags: ["Ethereum"],
      lastEditedTime: new Date("2026-08-25T06:00:00Z"),
    },
  },
];
const lesson = (
  slug: string,
  module: string,
  moduleOrder: number,
  lessonOrder: number
) => ({
  id: `ethereum-validator-operations/${slug}`,
  data: {
    notionId: `notion-${slug}`,
    title: slug,
    slug,
    description: slug,
    locale: "ko" as const,
    translationKey: slug,
    courseId: "course-1",
    courseSlug: "ethereum-validator-operations",
    module,
    moduleOrder,
    lessonOrder,
    tags: [],
    lastEditedTime: new Date("2026-08-25T06:00:00Z"),
  },
});

describe("buildCourseCatalog", () => {
  it("groups modules and produces previous/next navigation in curriculum order", () => {
    const catalog = buildCourseCatalog(courses, [
      lesson("monitor", "Operations", 2, 1),
      lesson("verify", "Setup", 1, 2),
      lesson("install", "Setup", 1, 1),
    ]);
    expect(catalog[0].modules.map(item => item.name)).toEqual([
      "Setup",
      "Operations",
    ]);
    expect(catalog[0].modules[0].lessons.map(item => item.data.slug)).toEqual([
      "install",
      "verify",
    ]);
    expect(catalog[0].lessonNavigation.verify).toEqual({
      previous: "install",
      next: "monitor",
    });
  });

  it("rejects a lesson whose course slug is not present", () => {
    const orphan = lesson("orphan", "Setup", 1, 1);
    orphan.data.courseSlug = "missing-course";
    expect(() => buildCourseCatalog(courses, [orphan])).toThrow(
      /unknown course/
    );
  });

  it("rejects a lesson from a different locale than its course", () => {
    const mismatched = lesson("english-lesson", "Setup", 1, 1);
    const englishLesson = {
      ...mismatched,
      data: { ...mismatched.data, locale: "en" as const },
    };

    expect(() => buildCourseCatalog(courses, [englishLesson])).toThrow(
      /Lesson.*en.*course.*ko/
    );
  });
});
