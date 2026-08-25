import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);
const read = (path: string) => readFile(new URL(path, dist), "utf8");

describe("unified site navigation and SEO", () => {
  it("exposes Tech Posts and Courses from the home page", async () => {
    const home = await read("index.html");
    expect(home).toContain('href="/posts/"');
    expect(home).toContain('href="/courses/"');
    expect(home).toContain("Latest Tech Posts");
    expect(home).toContain("Published Courses");
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
