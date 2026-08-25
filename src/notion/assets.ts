import path from "node:path";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

type FetchLike = typeof fetch;
export type AssetInput = { pageId: string; blockId: string; url: string };
export type AssetDependencies = {
  outputRoot: string;
  fetchImpl?: FetchLike;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
};

const safePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-");

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

export function validateAssetUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Asset URL is invalid");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateIpv4(host) ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:");
  if (url.protocol !== "https:") throw new Error("Asset URL must use HTTPS");
  if (url.username || url.password || privateHost)
    throw new Error("Asset URL must use a public host");
  return url;
}

export async function ingestAsset(input: AssetInput, deps: AssetDependencies) {
  const url = validateAssetUrl(input.url);
  const response = await (deps.fetchImpl ?? fetch)(url);
  if (!response.ok)
    throw new Error(`Asset download failed with status ${response.status}`);
  const contentType = response.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  const extension = contentType ? TYPES.get(contentType) : undefined;
  if (!extension)
    throw new Error(
      `Unsupported asset Content-Type: ${contentType ?? "missing"}`
    );
  const declared = Number(response.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("Asset exceeds 10 MiB");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("Asset exceeds 10 MiB");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  const pageId = safePart(input.pageId);
  const filename = `${safePart(input.blockId)}-${hash}.${extension}`;
  const outputPath = path.join(deps.outputRoot, pageId, filename);
  await deps.writeFile(outputPath, bytes);
  return {
    publicPath: `/notion-assets/${pageId}/${filename}`,
    outputPath,
    sha256: hash,
    bytes: bytes.byteLength,
  };
}
