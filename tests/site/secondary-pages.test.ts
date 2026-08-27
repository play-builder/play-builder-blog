import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const dist = new URL("dist/", root);
const html = (path: string) => readFile(new URL(path, dist), "utf8");

describe("localized secondary static pages", () => {
  it("isolates Archives and Tags by locale", async () => {
    const koreanArchives = await html("archives/index.html");
    const englishArchives = await html("en/archives/index.html");
    const koreanTags = await html("tags/index.html");
    const englishTags = await html("en/tags/index.html");

    expect(koreanArchives).toContain("SG 격리했는데 공격자 세션이 안 끊겼다");
    expect(englishArchives).toContain('lang="en"');
    expect(englishArchives).not.toContain(
      "SG 격리했는데 공격자 세션이 안 끊겼다"
    );
    expect(koreanTags).toContain('href="/tags/aws/"');
    expect(englishTags).not.toContain('href="/en/tags/aws/"');
  });

  it("configures Pagefind with the explicit route language", async () => {
    const korean = await html("search/index.html");
    const english = await html("en/search/index.html");
    const component = await readFile(
      new URL("src/components/pages/SearchPage.astro", root),
      "utf8"
    );

    expect(korean).toContain('data-pagefind-language="ko"');
    expect(english).toContain('data-pagefind-language="en"');
    expect(component).toContain(
      "language: pageFindSearch?.dataset?.pagefindLanguage"
    );
  });

  it("renders the authored Korean and preserved English About pages", async () => {
    const korean = await html("about/index.html");
    const english = await html("en/about/index.html");

    expect(korean).toContain("안녕하세요, Kai입니다.");
    expect(korean).not.toContain("Hi, I’m <strong>Kai</strong>.");
    expect(english).toContain("Hi, I’m <strong>Kai</strong>.");
    expect(english).not.toContain("안녕하세요, Kai입니다.");
  });

  it("uses locale-correct 404 labels and Home links", async () => {
    const korean = await html("404.html");
    const english = await html("en/404/index.html");

    expect(korean).toContain("페이지를 찾을 수 없습니다");
    expect(korean).toContain('href="/"');
    expect(english).toContain("Page Not Found");
    expect(english).toContain('href="/en/"');
  });

  it("splits RSS items and absolute URLs by locale", async () => {
    const korean = await html("rss.xml");
    const english = await html("en/rss.xml");

    expect(korean).toContain(
      "https://blog.playbuilder.xyz/posts/security-group-connection-tracking/"
    );
    expect(korean).toContain("SG 격리했는데 공격자 세션이 안 끊겼다");
    expect(english).not.toContain(
      "https://blog.playbuilder.xyz/posts/security-group-connection-tracking/"
    );
    expect(english).not.toContain("SG 격리했는데 공격자 세션이 안 끊겼다");
  });

  it("keeps the English tag wrapper locale-isolated for future content", async () => {
    const wrapper = await readFile(
      new URL("src/pages/en/tags/[tag]/[...page].astro", root),
      "utf8"
    );

    expect(wrapper).toContain('getPostsForLocale("en")');
    expect(wrapper).toContain('<TagPage locale="en"');
  });
});
