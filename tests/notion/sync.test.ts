import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { syncNotionCourses } from "@/notion/sync";

const fixture = async (name: string) =>
  JSON.parse(await readFile(new URL(`../fixtures/notion/${name}`, import.meta.url), "utf8"));

describe("syncNotionCourses", () => {
  it("generates only published content and safe YAML frontmatter", async () => {
    const courses = await fixture("courses.json");
    const lessons = await fixture("lessons.json");
    const markdown = await fixture("lesson-markdown.json");
    let generated: Record<string, string | Uint8Array> = {};
    const summary = await syncNotionCourses(
      { coursesDataSourceId: "courses", lessonsDataSourceId: "lessons" },
      {
        client: {
          queryDataSource: async id => (id === "courses" ? courses : lessons),
          retrievePageMarkdown: async id => markdown[id],
        },
        replaceGenerated: async files => void (generated = files),
      }
    );
    expect(summary).toEqual({ publishedCourses: 1, publishedLessons: 2, excludedCourses: 1, excludedLessons: 1 });
    expect(Object.keys(generated).sort()).toEqual([
      "courses/ethereum-validator-operations.json",
      "lessons/ethereum-validator-operations/install-clients.md",
      "lessons/ethereum-validator-operations/verify-sync.md",
    ]);
    expect(generated["lessons/ethereum-validator-operations/install-clients.md"]).toContain(
      'courseSlug: ethereum-validator-operations'
    );
  });

  it("does not replace the last successful output when markdown retrieval fails", async () => {
    let replaced = false;
    await expect(
      syncNotionCourses(
        { coursesDataSourceId: "courses", lessonsDataSourceId: "lessons" },
        {
          client: {
            queryDataSource: async id => fixture(id === "courses" ? "courses.json" : "lessons.json"),
            retrievePageMarkdown: async id => {
              throw new Error(`failed ${id}`);
            },
          },
          replaceGenerated: async () => void (replaced = true),
        }
      )
    ).rejects.toThrow(/lesson-1/);
    expect(replaced).toBe(false);
  });
});
