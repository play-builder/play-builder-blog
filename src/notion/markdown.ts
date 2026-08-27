export const normalizeNotionMarkdown = (markdown: string) =>
  markdown
    .replace(/^<empty-block\b[^>]*\/>[^\S\r\n]*$/gm, "")
    .replace(
      /^<table_of_contents\b[^>]*\/>[^\S\r\n]*$/gm,
      "## Table of contents"
    )
    .replace(/^(<\/table>[^\S\r\n]*)(\r?\n)(?=\S)/gm, "$1$2$2");

const ALLOWED_HTML_TAGS = new Set([
  "br",
  "col",
  "colgroup",
  "span",
  "table",
  "td",
  "tr",
]);

const unsupportedHtmlTags = (markdown: string) => {
  const tags = new Set<string>();
  let fence: { marker: "`" | "~"; length: number } | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (
        fenceMatch?.[1][0] === fence.marker &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }
    if (fenceMatch) {
      fence = {
        marker: fenceMatch[1][0] as "`" | "~",
        length: fenceMatch[1].length,
      };
      continue;
    }

    const withoutInlineCode = line.replace(/`+[^`]*`+/g, "");
    for (const match of withoutInlineCode.matchAll(
      /(^|[^\\])<\/?([A-Za-z][A-Za-z0-9_-]*)(?=[\s/>])/g
    )) {
      const tag = match[2].toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tag)) tags.add(tag);
    }
  }

  return [...tags].sort();
};

export const prepareNotionMarkdown = (markdown: string, pageId: string) => {
  const normalized = normalizeNotionMarkdown(markdown);
  const unsupported = unsupportedHtmlTags(normalized);
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported Notion markdown for ${pageId}: ${unsupported
        .map(tag => `<${tag}>`)
        .join(", ")}`
    );
  }
  return normalized;
};
