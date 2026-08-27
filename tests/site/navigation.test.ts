import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);
const read = (path: string) => readFile(new URL(path, dist), "utf8");

describe("unified site navigation and SEO", () => {
  it("exposes locale-correct Tech Posts and Courses from each Home", async () => {
    const korean = await read("index.html");
    const english = await read("en/index.html");

    expect(korean).toContain('href="/posts/"');
    expect(korean).toContain('href="/courses/"');
    expect(korean).toContain("최신 기술 블로그");
    expect(korean).toContain("공개 강좌");

    expect(english).toContain('href="/en/posts/"');
    expect(english).toContain('href="/en/courses/"');
    expect(english).toContain("Published Courses");
    expect(english).not.toContain("최신 기술 블로그");
  });

  it("uses the custom domain as canonical", async () => {
    expect(await read("index.html")).toContain(
      '<link rel="canonical" href="https://blog.playbuilder.xyz/">'
    );
  });

  it("keeps admin routes out of crawlers", async () => {
    expect(await read("robots.txt")).toContain("Disallow: /admin/");
    expect(await read("sitemap-0.xml")).not.toContain("/admin/");
  });
});
