import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";
import remarkToc from "remark-toc";
import {
  normalizeNotionMarkdown,
  prepareNotionMarkdown,
} from "@/notion/markdown";

describe("normalizeNotionMarkdown", () => {
  it.each([
    ["<empty-block/>", ""],
    ['<empty-block color="gray"/>', ""],
    ["before\n<empty-block/>\n<empty-block/>\nafter", "before\n\n\nafter"],
    ["before\r\n<empty-block/>\r\nafter", "before\r\n\r\nafter"],
  ])("normalizes Notion empty blocks: %s", (markdown, expected) => {
    expect(normalizeNotionMarkdown(markdown)).toBe(expected);
  });

  it.each([
    ["<table_of_contents/>", "## Table of contents"],
    ['<table_of_contents color="gray"/>', "## Table of contents"],
    ["<table_of_contents color=“gray”/>", "## Table of contents"],
  ])("normalizes Notion table of contents blocks: %s", (markdown, expected) => {
    expect(normalizeNotionMarkdown(markdown)).toBe(expected);
  });

  it.each([
    [
      "<table>\n<tr><td>value</td></tr>\n</table>\n### Next",
      "<table>\n<tr><td>value</td></tr>\n</table>\n\n### Next",
    ],
    [
      "<table>\r\n<tr><td>value</td></tr>\r\n</table>\r\n```bash\necho ok\n```",
      "<table>\r\n<tr><td>value</td></tr>\r\n</table>\r\n\r\n```bash\necho ok\n```",
    ],
    [
      "<table>\n<tr><td>value</td></tr>\n</table>\n\n- already separated",
      "<table>\n<tr><td>value</td></tr>\n</table>\n\n- already separated",
    ],
  ])("ends a Notion table before the following block", (markdown, expected) => {
    expect(normalizeNotionMarkdown(markdown)).toBe(expected);
  });

  it("is idempotent", () => {
    const markdown = `<table_of_contents/>
<table>
<tr><td>value</td></tr>
</table>
<empty-block/>
### Next`;
    const normalized = normalizeNotionMarkdown(markdown);

    expect(normalizeNotionMarkdown(normalized)).toBe(normalized);
  });
});

describe("prepareNotionMarkdown", () => {
  it("allows supported Notion table markup and Markdown code examples", () => {
    const markdown = `<https://developers.notion.com>
<table>
<colgroup><col width="120"></colgroup>
<tr><td><span color="gray">Value</span><br>Next</td></tr>
</table>

Inline example: \`<callout>not a block</callout>\`

\`\`\`html
<callout icon="info">
  code example
</callout>
\`\`\``;

    expect(prepareNotionMarkdown(markdown, "lesson-supported")).toBe(markdown);
  });

  it("reports the page and every unique unsupported tag", () => {
    const markdown = `<callout>one</callout>
<details><summary>two</summary></details>
<callout>three</callout>`;

    expect(() => prepareNotionMarkdown(markdown, "lesson-broken")).toThrow(
      "Unsupported Notion markdown for lesson-broken: <callout>, <details>, <summary>"
    );
  });
});

describe("Notion markdown Astro compatibility", () => {
  it("renders supported representative content without leaking Notion markers", async () => {
    const markdown = normalizeNotionMarkdown(`<table_of_contents color="gray"/>
## 1. Setup
### 1.1. Create resources
- first
- second

> **Note**
> Keep this value.

<table>
<tr><td>Item</td><td>Value</td></tr>
</table>
<empty-block/>
\`\`\`bash
echo ok
\`\`\``);
    const processor = await createMarkdownProcessor({
      syntaxHighlight: false,
      smartypants: false,
      remarkPlugins: [remarkToc],
    });

    const { code } = await processor.render(markdown);

    expect(code).toContain('<h2 id="table-of-contents">Table of contents</h2>');
    expect(code).toContain('href="#1-setup"');
    expect(code).toContain('<h3 id="11-create-resources">');
    expect(code).toContain("<ul>");
    expect(code).toContain("<blockquote>");
    expect(code).toContain("<table>");
    expect(code).toContain('<code class="language-bash">echo ok');
    expect(code).not.toMatch(/empty-block|table_of_contents|```bash/);
  });
});
