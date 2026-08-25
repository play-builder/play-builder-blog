import { describe, expect, it } from "vitest";
import { authorizeAdminRequest, type AdminEnv } from "@/admin/auth";

const env: AdminEnv = {
  CF_ACCESS_TEAM_DOMAIN: "playbuilder.cloudflareaccess.com",
  CF_ACCESS_AUD: "access-audience",
  ADMIN_ALLOWED_IPS: "203.0.113.10,2001:db8::10",
};
const request = (overrides: { url?: string; method?: string; ip?: string; origin?: string; token?: string } = {}) =>
  new Request(overrides.url ?? "https://blog.playbuilder.xyz/admin/publish/", {
    method: overrides.method ?? "GET",
    headers: {
      "CF-Connecting-IP": overrides.ip ?? "203.0.113.10",
      ...(overrides.origin ? { Origin: overrides.origin } : {}),
      "Cf-Access-Jwt-Assertion": overrides.token ?? "signed-token",
    },
  });
const verifyJwt = async () => ({ email: "admin@example.com", sub: "admin-subject" });

describe("authorizeAdminRequest", () => {
  it("accepts the custom host, exact IP, and a valid Access assertion", async () => {
    await expect(authorizeAdminRequest(request(), env, verifyJwt)).resolves.toEqual({
      email: "admin@example.com",
      sub: "admin-subject",
    });
  });

  it.each([
    request({ url: "https://play-builder.pages.dev/admin/publish/" }),
    request({ ip: "203.0.113.11" }),
    request({ token: "" }),
    request({ method: "POST", origin: "https://evil.example" }),
  ])("denies bypass, wrong IP, missing assertion, and cross-origin POST", async candidate => {
    await expect(authorizeAdminRequest(candidate, env, verifyJwt)).rejects.toMatchObject({ status: 403 });
  });
});
