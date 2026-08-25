import { describe, expect, it } from "vitest";
import { NotionReadClient } from "@/notion/client";

describe("NotionReadClient", () => {
  it("paginates a data source with the current API version", async () => {
    const requests: Request[] = [];
    const responses = [
      { results: [{ id: "one" }], has_more: true, next_cursor: "next-1" },
      { results: [{ id: "two" }], has_more: false, next_cursor: null },
    ];
    const client = new NotionReadClient({
      token: "test-token",
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(responses[requests.length - 1]);
      },
    });

    expect(await client.queryDataSource("courses-source")).toEqual([
      { id: "one" },
      { id: "two" },
    ]);
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(await requests[1].json()).toEqual({
      page_size: 100,
      start_cursor: "next-1",
    });
  });

  it("reports operation, page id, and status without leaking the upstream body", async () => {
    const client = new NotionReadClient({
      token: "test-token",
      fetchImpl: async () =>
        new Response("secret upstream body", { status: 429 }),
    });
    await expect(client.retrievePageMarkdown("lesson-1")).rejects.toThrow(
      "retrieve page markdown failed for lesson-1 with status 429"
    );
    await expect(client.retrievePageMarkdown("lesson-1")).rejects.not.toThrow(
      /secret upstream body/
    );
  });

  it("rejects truncated markdown instead of silently publishing missing blocks", async () => {
    const client = new NotionReadClient({
      token: "test-token",
      fetchImpl: async () =>
        Response.json({
          object: "page_markdown",
          id: "lesson-1",
          markdown: "# Partial lesson",
          truncated: true,
          unknown_block_ids: ["block-unknown-1"],
        }),
    });
    await expect(client.retrievePageMarkdown("lesson-1")).rejects.toThrow(
      /lesson-1.*block-unknown-1/
    );
  });
});
