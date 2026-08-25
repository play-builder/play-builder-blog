import { describe, expect, it } from "vitest";
import { handlePublishRequest } from "@/admin/publish";

const env = {
  CLOUDFLARE_PAGES_DEPLOY_HOOK_URL:
    "https://api.cloudflare.com/deploy-hooks/secret",
};

describe("handlePublishRequest", () => {
  it("rejects non-POST requests", async () => {
    const response = await handlePublishRequest(
      new Request("https://blog.playbuilder.xyz/admin/api/publish"),
      env,
      {
        fetchImpl: fetch,
      }
    );
    expect(response.status).toBe(405);
  });

  it("reports a deployment request without exposing the hook", async () => {
    const response = await handlePublishRequest(
      new Request("https://blog.playbuilder.xyz/admin/api/publish", {
        method: "POST",
      }),
      env,
      {
        fetchImpl: async () =>
          new Response("upstream deployment id", { status: 201 }),
      }
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "deployment_requested" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a bounded error when the Deploy Hook rejects the request", async () => {
    const response = await handlePublishRequest(
      new Request("https://blog.playbuilder.xyz/admin/api/publish", {
        method: "POST",
      }),
      env,
      {
        fetchImpl: async () =>
          new Response("secret upstream response", { status: 500 }),
      }
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret");
  });
});
