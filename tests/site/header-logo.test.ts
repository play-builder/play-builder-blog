import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);

describe("header brand logo", () => {
  it("renders the uploaded logo as an accessible responsive home link", async () => {
    const page = await readFile(new URL("index.html", dist), "utf8");
    const logoLink = page.match(
      /<a[^>]*aria-label="Play Builder"[^>]*>[\s\S]*?<\/a>/
    )?.[0];

    expect(logoLink).toBeDefined();
    expect(logoLink).toContain("bg-white");
    expect(logoLink).toContain(
      'src="/the-play-builder-pb-logo-transparent.png"'
    );
    expect(logoLink).toContain('alt=""');
    expect(logoLink).toContain("h-8");
    expect(logoLink).toContain("sm:h-10");
    await expect(
      access(new URL("the-play-builder-pb-logo-transparent.png", dist))
    ).resolves.toBeUndefined();
  });
});
