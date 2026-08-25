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
    Slug: { type: "rich_text", rich_text: richText("ethereum-validator-operations") },
    Description: { type: "rich_text", rich_text: richText("Operate validators safely") },
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
    Description: { type: "rich_text", rich_text: richText("Install execution and consensus clients") },
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
      order: 1,
      status: "Published",
      tags: ["Ethereum"],
      lastEditedTime: "2026-08-25T06:00:00.000Z",
    });
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
