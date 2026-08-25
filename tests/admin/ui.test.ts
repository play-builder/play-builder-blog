import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("publish console", () => {
  it("requires confirmation and distinguishes request from deployment completion", async () => {
    const html = await readFile(new URL("../../dist/admin/publish/index.html", import.meta.url), "utf8");
    expect(html).toContain('action="/admin/api/publish"');
    expect(html).toContain("Publish current Notion content");
    expect(html).toContain("deployment_requested");
    expect(html).toContain("Cloudflare Pages Deployments");
    expect(html).toContain("window.confirm");
  });
});
