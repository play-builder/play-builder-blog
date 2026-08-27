import { describe, expect, it } from "vitest";
import {
  parseCoursePage,
  parseLessonPage,
  selectPublishedContent,
} from "@/notion/model";

const richText = (value: string) => [{ plain_text: value }];
const coursePage = () => ({
  id: "course-1",
  last_edited_time: "2026-08-25T06:00:00.000Z",
  properties: {
    Title: { type: "title", title: richText("Ethereum Validator Operations") },
    Slug: {
      type: "rich_text",
      rich_text: richText("ethereum-validator-operations"),
    },
    Description: {
      type: "rich_text",
      rich_text: richText("Operate validators safely"),
    },
    Locale: { type: "select", select: { name: "ko" } },
    TranslationKey: {
      type: "rich_text",
      rich_text: richText("ethereum-validator-operations"),
    },
    Order: { type: "number", number: 1 },
    Status: { type: "status", status: { name: "Published" } },
    Tags: { type: "multi_select", multi_select: [{ name: "Ethereum" }] },
    Cover: { type: "files", files: [] },
  },
});
const lessonPage = () => ({
  id: "lesson-1",
  last_edited_time: "2026-08-25T06:10:00.000Z",
  properties: {
    Title: { type: "title", title: richText("Install clients") },
    Slug: { type: "rich_text", rich_text: richText("install-clients") },
    Description: {
      type: "rich_text",
      rich_text: richText("Install execution and consensus clients"),
    },
    Locale: { type: "select", select: { name: "ko" } },
    TranslationKey: {
      type: "rich_text",
      rich_text: richText("install-clients"),
    },
    Course: { type: "relation", relation: [{ id: "course-1" }] },
    Module: { type: "select", select: { name: "Setup" } },
    ModuleOrder: { type: "number", number: 1 },
    LessonOrder: { type: "number", number: 1 },
    Status: { type: "status", status: { name: "Published" } },
    EstimatedMinutes: { type: "number", number: 30 },
    Tags: { type: "multi_select", multi_select: [{ name: "Linux" }] },
  },
});

describe("Notion content model", () => {
  it("normalizes a published course page", () => {
    expect(parseCoursePage(coursePage())).toEqual({
      id: "course-1",
      title: "Ethereum Validator Operations",
      slug: "ethereum-validator-operations",
      description: "Operate validators safely",
      locale: "ko",
      translationKey: "ethereum-validator-operations",
      order: 1,
      status: "Published",
      tags: ["Ethereum"],
      lastEditedTime: "2026-08-25T06:00:00.000Z",
    });
  });

  it("normalizes a localized lesson page", () => {
    expect(parseLessonPage(lessonPage())).toEqual({
      id: "lesson-1",
      title: "Install clients",
      slug: "install-clients",
      description: "Install execution and consensus clients",
      locale: "ko",
      translationKey: "install-clients",
      courseId: "course-1",
      module: "Setup",
      moduleOrder: 1,
      lessonOrder: 1,
      status: "Published",
      estimatedMinutes: 30,
      tags: ["Linux"],
      lastEditedTime: "2026-08-25T06:10:00.000Z",
    });
  });

  it("identifies the page when Locale is missing", () => {
    const page = coursePage();
    Reflect.deleteProperty(page.properties, "Locale");

    expect(() => parseCoursePage(page)).toThrow(/page course-1.*Locale/);
  });

  it("rejects an unsupported Locale", () => {
    const page = lessonPage();
    page.properties.Locale.select.name = "fr";

    expect(() => parseLessonPage(page)).toThrow(/page lesson-1.*Locale.*ko.*en/);
  });

  it("identifies the page when TranslationKey is missing", () => {
    const page = lessonPage();
    Reflect.deleteProperty(page.properties, "TranslationKey");

    expect(() => parseLessonPage(page)).toThrow(
      /page lesson-1.*TranslationKey/
    );
  });

  it.each(["", "Install_Clients", "Install Clients"])(
    "rejects invalid TranslationKey %j",
    translationKey => {
      const page = lessonPage();
      page.properties.TranslationKey.rich_text = richText(translationKey);

      expect(() => parseLessonPage(page)).toThrow(
        /page lesson-1.*TranslationKey.*lowercase kebab-case/
      );
    }
  );

  it("validates localization metadata on Draft rows", () => {
    const page = coursePage();
    page.properties.Status.status.name = "Draft";
    page.properties.TranslationKey.rich_text = richText("Invalid_Key");

    expect(() => parseCoursePage(page)).toThrow(
      /page course-1.*TranslationKey/
    );
  });

  it("rejects a slug that is not lowercase kebab-case", () => {
    const page = coursePage();
    page.properties.Slug.rich_text = richText("Bad Slug");
    expect(() => parseCoursePage(page)).toThrow(/kebab-case/);
  });

  it("publishes lessons only when both lesson and course are Published", () => {
    const draftPage = lessonPage();
    draftPage.properties.Status.status.name = "Draft";
    const publication = selectPublishedContent(
      [parseCoursePage(coursePage())],
      [parseLessonPage(draftPage)]
    );
    expect(publication.courses).toHaveLength(1);
    expect(publication.lessons).toEqual([]);
  });

  it("rejects a published lesson related to an unknown course", () => {
    const page = lessonPage();
    page.properties.Course.relation = [{ id: "missing-course" }];
    expect(() =>
      selectPublishedContent(
        [parseCoursePage(coursePage())],
        [parseLessonPage(page)]
      )
    ).toThrow(/unknown course/);
  });
});
