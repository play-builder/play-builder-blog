import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);
const html = (path: string) => readFile(new URL(path, dist), "utf8");

const compiledCss = async () => {
  const assets = new URL("_astro/", dist);
  const files = (await readdir(assets)).filter(file => file.endsWith(".css"));
  return (
    await Promise.all(files.map(file => readFile(new URL(file, assets), "utf8")))
  ).join("\n");
};

describe("responsive wide layout", () => {
  it("ships a wide application shell and a bounded reading measure", async () => {
    const css = await compiledCss();

    expect(css).toContain("--app-shell-max-width:90rem");
    expect(css).toContain("--app-reading-max-width:64rem");
  });

  it("uses available width for post listings and keeps articles readable", async () => {
    const posts = await html("posts/index.html");
    const article = await html(
      "posts/kinesis-hot-shard-split-aggregate/index.html"
    );

    expect(posts).toContain("lg:grid-cols-2");
    expect(article).toContain("app-reading");
  });

  it("expands the course catalog from one to three responsive columns", async () => {
    const page = await html("courses/index.html");

    expect(page).toContain("md:grid-cols-2");
    expect(page).toContain("xl:grid-cols-3");
  });

  it("keeps course navigation beside the content only on large screens", async () => {
    const course = await html(
      "courses/ethereum-validator-operations/index.html"
    );
    const lesson = await html(
      "courses/ethereum-validator-operations/install-clients/index.html"
    );

    expect(course).toContain(
      "lg:grid-cols-[minmax(0,1fr)_20rem]"
    );
    expect(lesson).toContain(
      "lg:grid-cols-[20rem_minmax(0,1fr)]"
    );
    expect(lesson).toContain("lg:sticky");
    expect(lesson).toContain("lg:hidden");
  });

  it("does not repeat the course overview sidebar on small screens", async () => {
    const course = await html(
      "courses/ethereum-validator-operations/index.html"
    );

    expect(course).toContain(
      'class="hidden self-start lg:sticky lg:top-6 lg:block"'
    );
  });
});
