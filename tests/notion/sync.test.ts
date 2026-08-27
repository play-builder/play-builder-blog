import { readFile } from "node:fs/promises";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";
import remarkToc from "remark-toc";
import { syncNotionCourses } from "@/notion/sync";

const fixture = async (name: string) =>
  JSON.parse(
    await readFile(
      new URL(`../fixtures/notion/${name}`, import.meta.url),
      "utf8"
    )
  );

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
    expect(summary).toEqual({
      publishedCourses: 2,
      publishedLessons: 4,
      excludedCourses: 1,
      excludedLessons: 1,
    });
    expect(Object.keys(generated).sort()).toEqual([
      "courses/en/ethereum-validator-operations.json",
      "courses/ko/ethereum-validator-operations.json",
      "lessons/en/ethereum-validator-operations/install-clients.md",
      "lessons/en/ethereum-validator-operations/verify-sync.md",
      "lessons/ko/ethereum-validator-operations/install-clients.md",
      "lessons/ko/ethereum-validator-operations/verify-sync.md",
    ]);
    expect(
      generated["courses/ko/ethereum-validator-operations.json"]
    ).toContain('"locale": "ko"');
    expect(
      generated["courses/en/ethereum-validator-operations.json"]
    ).toContain('"translationKey": "ethereum-validator-operations"');
    expect(
      generated[
        "lessons/ko/ethereum-validator-operations/install-clients.md"
      ]
    ).toContain("locale: ko");
    expect(
      generated[
        "lessons/en/ethereum-validator-operations/install-clients.md"
      ]
    ).toContain("translationKey: install-clients");
    expect(generated).not.toHaveProperty(
      "courses/ethereum-validator-operations.json"
    );
    expect(generated).not.toHaveProperty(
      "lessons/ethereum-validator-operations/install-clients.md"
    );
  });

  it("does not replace the last successful output when markdown retrieval fails", async () => {
    let replaced = false;
    await expect(
      syncNotionCourses(
        { coursesDataSourceId: "courses", lessonsDataSourceId: "lessons" },
        {
          client: {
            queryDataSource: async id =>
              fixture(id === "courses" ? "courses.json" : "lessons.json"),
            retrievePageMarkdown: async id => {
              throw new Error(`failed ${id}`);
            },
          },
          replaceGenerated: async () => void (replaced = true),
        }
      )
    ).rejects.toThrow(/lesson-(?:ko|en)-1/);
    expect(replaced).toBe(false);
  });

  it("ends a Notion table before rendering the following markdown blocks", async () => {
    const courses = await fixture("courses.json");
    const lessons = await fixture("lessons.json");
    const notionMarkdown = `<table header-row="true">
<tr><td>항목</td><td>내용</td></tr>
</table>
> **Note**
\t설명입니다.
### 0.1. Organization 만들기
- 첫 항목
- 둘째 항목`;
    let generated: Record<string, string | Uint8Array> = {};

    await syncNotionCourses(
      { coursesDataSourceId: "courses", lessonsDataSourceId: "lessons" },
      {
        client: {
          queryDataSource: async id => (id === "courses" ? courses : lessons),
          retrievePageMarkdown: async () => notionMarkdown,
        },
        replaceGenerated: async files => void (generated = files),
      }
    );

    const lesson =
      generated[
        "lessons/ko/ethereum-validator-operations/install-clients.md"
      ];
    expect(typeof lesson).toBe("string");
    const markdown = lesson as string;
    const bodyStart = markdown.indexOf("---\n\n", 3);
    expect(bodyStart).toBeGreaterThan(0);

    const processor = await createMarkdownProcessor({
      syntaxHighlight: false,
      smartypants: false,
    });
    const { code } = await processor.render(markdown.slice(bodyStart + 5));

    expect(code).toContain("<blockquote>");
    expect(code).toContain('<h3 id="01-organization-만들기">');
    expect(code).toContain("<ul>");
    expect(code).not.toContain("### 0.1. Organization 만들기");
  });

  it("converts a Notion table of contents block for the site TOC plugin", async () => {
    const courses = await fixture("courses.json");
    const lessons = await fixture("lessons.json");
    const notionMarkdown = `<table_of_contents color=“gray”/>
## 0. 사전 준비
### 0.1. Organization 만들기`;
    let generated: Record<string, string | Uint8Array> = {};

    await syncNotionCourses(
      { coursesDataSourceId: "courses", lessonsDataSourceId: "lessons" },
      {
        client: {
          queryDataSource: async id => (id === "courses" ? courses : lessons),
          retrievePageMarkdown: async () => notionMarkdown,
        },
        replaceGenerated: async files => void (generated = files),
      }
    );

    const lesson =
      generated[
        "lessons/ko/ethereum-validator-operations/install-clients.md"
      ];
    expect(typeof lesson).toBe("string");
    const markdown = lesson as string;
    const bodyStart = markdown.indexOf("---\n\n", 3);
    expect(bodyStart).toBeGreaterThan(0);

    const processor = await createMarkdownProcessor({
      syntaxHighlight: false,
      smartypants: false,
      remarkPlugins: [remarkToc],
    });
    const { code } = await processor.render(markdown.slice(bodyStart + 5));

    expect(code).toContain('<h2 id="table-of-contents">Table of contents</h2>');
    expect(code).toContain(">0. 사전 준비</a>");
    expect(code).not.toContain("table_of_contents");
  });
});
