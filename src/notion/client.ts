export const NOTION_API_VERSION = "2026-03-11";
type FetchLike = typeof fetch;

export class NotionApiError extends Error {
  constructor(operation: string, resourceId: string, status: number) {
    super(`${operation} failed for ${resourceId} with status ${status}`);
  }
}

export class NotionReadClient {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(options: {
    token: string;
    fetchImpl?: FetchLike;
    baseUrl?: string;
  }) {
    if (!options.token) throw new Error("NOTION_TOKEN is required");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? "https://api.notion.com/v1";
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    };
  }

  async queryDataSource(id: string): Promise<unknown[]> {
    const results: unknown[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.fetchImpl(
        `${this.baseUrl}/data_sources/${encodeURIComponent(id)}/query`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {}),
          }),
        }
      );
      if (!response.ok)
        throw new NotionApiError("query data source", id, response.status);
      const payload = (await response.json()) as {
        results?: unknown[];
        has_more?: boolean;
        next_cursor?: string | null;
      };
      if (!Array.isArray(payload.results))
        throw new NotionApiError("query data source", id, 502);
      results.push(...payload.results);
      cursor =
        payload.has_more && payload.next_cursor
          ? payload.next_cursor
          : undefined;
    } while (cursor);
    return results;
  }

  async retrievePageMarkdown(pageId: string): Promise<string> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/pages/${encodeURIComponent(pageId)}/markdown`,
      {
        headers: this.headers(),
      }
    );
    if (!response.ok)
      throw new NotionApiError(
        "retrieve page markdown",
        pageId,
        response.status
      );
    const payload = (await response.json()) as {
      markdown?: unknown;
      truncated?: unknown;
      unknown_block_ids?: unknown;
    };
    if (typeof payload.markdown !== "string")
      throw new NotionApiError("retrieve page markdown", pageId, 502);
    const unknownIds = Array.isArray(payload.unknown_block_ids)
      ? payload.unknown_block_ids.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    if (payload.truncated === true || unknownIds.length > 0) {
      throw new Error(
        `Markdown for ${pageId} is incomplete; unknown blocks: ${unknownIds.join(", ") || "not reported"}`
      );
    }
    return payload.markdown;
  }
}
