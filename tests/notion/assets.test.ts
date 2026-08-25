import { describe, expect, it } from "vitest";
import { ingestAsset, validateAssetUrl } from "@/notion/assets";

describe("Notion asset ingestion", () => {
  it.each([
    "http://example.com/a.png",
    "https://127.0.0.1/a.png",
    "https://10.1.2.3/a.png",
    "https://localhost/a.png",
    "https://metadata.google.internal/a.png",
  ])("rejects non-public asset URL %s", value => {
    expect(() => validateAssetUrl(value)).toThrow();
  });

  it("writes an image to a deterministic public path", async () => {
    const writes: Array<{ path: string; bytes: Uint8Array }> = [];
    const result = await ingestAsset(
      {
        pageId: "page-1",
        blockId: "block-1",
        url: "https://images.example.com/a.png",
      },
      {
        outputRoot: "/safe/public/notion-assets",
        fetchImpl: async () =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "Content-Type": "image/png", "Content-Length": "4" },
          }),
        writeFile: async (path, bytes) => void writes.push({ path, bytes }),
      }
    );
    expect(result.publicPath).toMatch(
      /^\/notion-assets\/page-1\/block-1-[a-f0-9]{16}\.png$/
    );
    expect(
      writes[0].path.startsWith("/safe/public/notion-assets/page-1/")
    ).toBe(true);
  });

  it("rejects unsupported and oversized responses", async () => {
    const base = {
      outputRoot: "/safe/public/notion-assets",
      writeFile: async () => undefined,
    };
    await expect(
      ingestAsset(
        { pageId: "p", blockId: "b", url: "https://example.com/a.txt" },
        {
          ...base,
          fetchImpl: async () =>
            new Response("text", { headers: { "Content-Type": "text/plain" } }),
        }
      )
    ).rejects.toThrow(/Content-Type/);
    await expect(
      ingestAsset(
        { pageId: "p", blockId: "b", url: "https://example.com/a.png" },
        {
          ...base,
          fetchImpl: async () =>
            new Response("", {
              headers: {
                "Content-Type": "image/png",
                "Content-Length": "10485761",
              },
            }),
        }
      )
    ).rejects.toThrow(/10 MiB/);
  });
});
