import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AdminEnv = {
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
};
export type AdminIdentity = { email: string; sub: string };
export type VerifyAccessJwt = (
  token: string,
  env: AdminEnv
) => Promise<JWTPayload>;

export class AdminAuthorizationError extends Error {
  readonly status = 403;
}

const deny = (message: string): never => {
  throw new AdminAuthorizationError(message);
};

const normalizeTeamDomain = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

export const parseAccessAudiences = (value: string) =>
  value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

export const verifyAccessJwt: VerifyAccessJwt = async (token, env) => {
  const domain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  if (!domain.endsWith(".cloudflareaccess.com"))
    deny("Invalid Access team domain configuration");
  const audiences = parseAccessAudiences(env.CF_ACCESS_AUD);
  if (!audiences.length) deny("Invalid Access audience configuration");
  const issuer = `https://${domain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: audiences,
  });
  return payload;
};

export async function authorizeAdminRequest(
  request: Request,
  env: AdminEnv,
  verifier: VerifyAccessJwt = verifyAccessJwt
): Promise<AdminIdentity> {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.hostname !== "blog.playbuilder.xyz")
    deny("Admin custom hostname required");

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (request.headers.get("Origin") !== "https://blog.playbuilder.xyz")
      deny("Request origin is not allowed");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token)
    throw new AdminAuthorizationError(
      "Cloudflare Access assertion is required"
    );
  let payload: JWTPayload;
  try {
    payload = await verifier(token, env);
  } catch {
    return deny("Cloudflare Access assertion is invalid");
  }
  const email = payload.email;
  const sub = payload.sub;
  if (typeof email === "string" && typeof sub === "string")
    return { email, sub };
  throw new AdminAuthorizationError(
    "Cloudflare Access identity claims are incomplete"
  );
}

export const forbiddenResponse = () =>
  Response.json(
    { error: "forbidden" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
