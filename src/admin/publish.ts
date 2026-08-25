export type PublishEnv = { CLOUDFLARE_PAGES_DEPLOY_HOOK_URL: string };
type FetchLike = typeof fetch;

const json = (body: unknown, status: number, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });

export async function handlePublishRequest(
  request: Request,
  env: PublishEnv,
  deps: { fetchImpl?: FetchLike } = {}
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  let hook: URL;
  try {
    hook = new URL(env.CLOUDFLARE_PAGES_DEPLOY_HOOK_URL);
  } catch {
    return json({ error: "publish_not_configured" }, 503);
  }
  if (hook.protocol !== "https:")
    return json({ error: "publish_not_configured" }, 503);
  try {
    const response = await (deps.fetchImpl ?? fetch)(hook, {
      method: "POST",
      headers: { "User-Agent": "play-builder-publish-console/1.0" },
    });
    if (!response.ok) return json({ error: "deployment_request_failed" }, 502);
    return json({ status: "deployment_requested" }, 202);
  } catch {
    return json({ error: "deployment_request_failed" }, 502);
  }
}
