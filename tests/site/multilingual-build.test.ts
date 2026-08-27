import { access, readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const dist = new URL("dist/", root);
const siteOrigin = "https://blog.playbuilder.xyz";

const output = (path: string) => new URL(path, dist);
const read = (path: string) => readFile(output(path), "utf8");

async function exists(path: string) {
  try {
    await access(output(path));
    return true;
  } catch {
    return false;
  }
}

async function htmlFiles(directory = dist): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) return htmlFiles(target);
      return entry.name.endsWith(".html") ? [target] : [];
    })
  );
  return nested.flat();
}

function artifactPath(href: string) {
  const url = new URL(href);
  expect(url.origin).toBe(siteOrigin);

  const relative = url.pathname.replace(/^\//, "");
  if (relative === "") return "index.html";
  if (/\.[a-z0-9]+$/i.test(relative)) return relative;
  return `${relative.replace(/\/$/, "")}/index.html`;
}

describe("multilingual fixture build contract", () => {
  it("preserves Korean URLs and generates the English locale tree", async () => {
    const required = [
      "index.html",
      "en/index.html",
      "courses/index.html",
      "en/courses/index.html",
      "posts/index.html",
      "en/posts/index.html",
      "posts/security-group-connection-tracking/index.html",
      "courses/ethereum-validator-operations/index.html",
      "rss.xml",
      "en/rss.xml",
    ];

    await Promise.all(
      required.map(async path => expect(await exists(path), path).toBe(true))
    );
  });

  it("builds separate Pagefind indexes and language-tagged documents", async () => {
    const pagefindEntries = await readdir(output("pagefind"));
    expect(pagefindEntries.some(name => /^pagefind\.ko_.+\.pf_meta$/.test(name))).toBe(true);
    expect(pagefindEntries.some(name => /^pagefind\.en_.+\.pf_meta$/.test(name))).toBe(true);

    expect(await read("index.html")).toContain('<html dir="ltr" lang="ko"');
    expect(await read("en/index.html")).toContain('<html dir="ltr" lang="en"');
  });

  it("publishes both locale trees in sitemap without protected or error routes", async () => {
    const sitemap = await read("sitemap-0.xml");

    expect(sitemap).toContain(`<loc>${siteOrigin}/courses/</loc>`);
    expect(sitemap).toContain(`<loc>${siteOrigin}/en/courses/</loc>`);
    expect(sitemap).toContain(`<loc>${siteOrigin}/posts/</loc>`);
    expect(sitemap).toContain(`<loc>${siteOrigin}/en/posts/</loc>`);
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/admin/publish");
    expect(sitemap).not.toContain("/admin/api/publish");
    expect(sitemap).not.toContain("/404/");
  });

  it("keeps canonical and hreflang targets absolute and generated", async () => {
    const files = await htmlFiles();

    for (const file of files) {
      const html = await readFile(file, "utf8");
      const links = html.matchAll(
        /<link rel="(?:canonical|alternate)"[^>]* href="([^"]+)"/g
      );

      for (const [, href] of links) {
        const path = artifactPath(href);
        expect(await exists(path), `${file.pathname} -> ${href}`).toBe(true);
      }
    }
  });

  it("does not advertise list fallbacks as detail-page translations", async () => {
    const untranslatedPost = await read(
      "posts/security-group-connection-tracking/index.html"
    );
    expect(untranslatedPost).not.toContain('hreflang="en"');
    expect(untranslatedPost).not.toContain(
      `hreflang="en" href="${siteOrigin}/en/posts/"`
    );

    const translatedCourse = await read(
      "courses/ethereum-validator-operations/index.html"
    );
    expect(translatedCourse).toContain(
      `hreflang="en" href="${siteOrigin}/en/courses/ethereum-validator-operations/"`
    );
  });
});
