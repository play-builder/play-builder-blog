import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);
const html = (path: string) => readFile(new URL(path, dist), "utf8");

describe("course static pages", () => {
  it("links the course list to the published course", async () => {
    expect(await html("courses/index.html")).toContain(
      'href="/courses/ethereum-validator-operations/"'
    );
  });

  it("renders modules and lesson links on the course page", async () => {
    const page = await html("courses/ethereum-validator-operations/index.html");
    expect(page).toContain("Setup");
    expect(page).toContain('href="/courses/ethereum-validator-operations/install-clients/"');
  });

  it("marks the current lesson and Pagefind content type", async () => {
    const page = await html("courses/ethereum-validator-operations/install-clients/index.html");
    expect(page).toContain('aria-current="page"');
    expect(page).toContain('data-pagefind-filter="content:course"');
    expect(page).toContain("Install the execution and consensus clients.");
  });
});
