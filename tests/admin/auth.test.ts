import { describe, expect, it } from "vitest";
import {
  authorizeAdminRequest,
  parseAccessAudiences,
  type AdminEnv,
} from "@/admin/auth";

const env: AdminEnv = {
  CF_ACCESS_TEAM_DOMAIN: "playbuilder.cloudflareaccess.com",
  CF_ACCESS_AUD: "access-audience",
};
const request = (
  overrides: {
    url?: string;
    method?: string;
    ip?: string | null;
    origin?: string;
    token?: string;
  } = {}
) =>
  new Request(overrides.url ?? "https://blog.playbuilder.xyz/admin/publish/", {
    method: overrides.method ?? "GET",
    headers: {
      ...(overrides.ip === null
        ? {}
        : { "CF-Connecting-IP": overrides.ip ?? "203.0.113.10" }),
      ...(overrides.origin ? { Origin: overrides.origin } : {}),
      "Cf-Access-Jwt-Assertion": overrides.token ?? "signed-token",
    },
  });
const verifyJwt = async () => ({
  email: "admin@example.com",
  sub: "admin-subject",
});

describe("authorizeAdminRequest", () => {
  it("accepts comma-separated AUD values for exact and wildcard Access applications", () => {
    expect(parseAccessAudiences("aud-exact, aud-wildcard")).toEqual([
      "aud-exact",
      "aud-wildcard",
    ]);
  });

  it("accepts the custom host and a valid Access assertion from any IP", async () => {
    await expect(
      authorizeAdminRequest(request(), env, verifyJwt)
    ).resolves.toEqual({
      email: "admin@example.com",
      sub: "admin-subject",
    });
  });

  it("accepts a valid Access assertion without a source IP header", async () => {
    await expect(
      authorizeAdminRequest(request({ ip: null }), env, verifyJwt)
    ).resolves.toEqual({
      email: "admin@example.com",
      sub: "admin-subject",
    });
  });

  it.each([
    request({ url: "https://play-builder.pages.dev/admin/publish/" }),
    request({ token: "" }),
    request({ method: "POST", origin: "https://evil.example" }),
  ])(
    "denies hostname bypass, missing assertion, and cross-origin POST",
    async candidate => {
      await expect(
        authorizeAdminRequest(candidate, env, verifyJwt)
      ).rejects.toMatchObject({ status: 403 });
    }
  );
});
