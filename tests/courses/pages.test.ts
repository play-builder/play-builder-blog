import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);
const html = (path: string) => readFile(new URL(path, dist), "utf8");

describe("course static pages", () => {
  it("keeps the Korean and English catalogs isolated", async () => {
    const korean = await html("courses/index.html");
    const english = await html("en/courses/index.html");

    expect(korean).toContain('lang="ko"');
    expect(korean).toContain("이더리움 검증인 운영");
    expect(korean).not.toContain("Ethereum Validator Operations");
    expect(korean).toContain(
      'href="/courses/ethereum-validator-operations/"'
    );

    expect(english).toContain('lang="en"');
    expect(english).toContain("Ethereum Validator Operations");
    expect(english).not.toContain("이더리움 검증인 운영");
    expect(english).toContain(
      'href="/en/courses/ethereum-validator-operations/"'
    );
  });

  it("keeps the course catalog focused on published courses", async () => {
    expect(await html("courses/index.html")).not.toContain(
      "Step-by-step labs and operational guides maintained in Notion"
    );
  });

  it("renders localized Course detail links and translation metadata", async () => {
    const korean = await html(
      "courses/ethereum-validator-operations/index.html"
    );
    const english = await html(
      "en/courses/ethereum-validator-operations/index.html"
    );

    expect(korean).toContain("클라이언트 설치");
    expect(korean).not.toContain("Install clients");
    expect(korean).toContain(
      'href="/courses/ethereum-validator-operations/install-clients/"'
    );
    expect(korean).toContain(
      'href="/en/courses/ethereum-validator-operations/"'
    );
    expect(korean).toContain('hreflang="ko"');
    expect(korean).toContain('hreflang="en"');
    expect(korean).toContain('hreflang="x-default"');

    expect(english).toContain("Install clients");
    expect(english).not.toContain("클라이언트 설치");
    expect(english).toContain(
      'href="/en/courses/ethereum-validator-operations/install-clients/"'
    );
    expect(english).toContain(
      'href="/courses/ethereum-validator-operations/"'
    );
  });

  it("renders localized Lessons and marks Pagefind content", async () => {
    const korean = await html(
      "courses/ethereum-validator-operations/install-clients/index.html"
    );
    const english = await html(
      "en/courses/ethereum-validator-operations/install-clients/index.html"
    );

    expect(korean).toContain('aria-current="page"');
    expect(korean).toContain('data-pagefind-filter="content:course"');
    expect(korean).toContain("실행 및 합의 클라이언트를 설치합니다.");
    expect(korean).not.toContain(
      "Install the execution and consensus clients."
    );

    expect(english).toContain('aria-current="page"');
    expect(english).toContain('data-pagefind-filter="content:course"');
    expect(english).toContain("Install the execution and consensus clients.");
    expect(english).not.toContain("실행 및 합의 클라이언트를 설치합니다.");
    expect(english).toContain(
      'href="/courses/ethereum-validator-operations/install-clients/"'
    );
  });
});
