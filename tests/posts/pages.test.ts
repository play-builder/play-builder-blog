import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);
const html = (path: string) => readFile(new URL(path, dist), "utf8");

describe("localized Home and Tech Post static pages", () => {
  it("renders a Korean-default Home and an isolated English Home", async () => {
    const korean = await html("index.html");
    const english = await html("en/index.html");

    expect(korean).toContain('lang="ko"');
    expect(korean).toContain("시스템을 만들고, 검증된 경험을 공유합니다.");
    expect(korean).toContain(
      '<meta name="description" content="블록체인 네트워크, 클라우드 네이티브 플랫폼과 분산 시스템의 핵심 인프라를 구축하고 운영합니다.">'
    );
    expect(korean).toContain("이더리움 검증인 운영");
    expect(korean).not.toContain("Ethereum Validator Operations");
    expect(korean).toContain('href="/en/"');

    expect(english).toContain('lang="en"');
    expect(english).toContain("Build systems. Share what works.");
    expect(english).toContain(
      '<meta name="description" content="I build and operate mission-critical infrastructure for blockchain networks, cloud-native platforms, and distributed systems.">'
    );
    expect(english).toContain("Ethereum Validator Operations");
    expect(english).not.toContain("이더리움 검증인 운영");
    expect(english).not.toContain("SG 격리했는데 공격자 세션이 안 끊겼다");
    expect(english).toContain('href="/"');
  });

  it("does not leak Korean cards into the English Posts list", async () => {
    const korean = await html("posts/index.html");
    const english = await html("en/posts/index.html");

    expect(korean).toContain('lang="ko"');
    expect(korean).toContain("SG 격리했는데 공격자 세션이 안 끊겼다");
    expect(english).toContain('lang="en"');
    expect(english).toContain("No published Tech Posts yet.");
    expect(english).not.toContain("SG 격리했는데 공격자 세션이 안 끊겼다");
  });

  it("uses the target Posts list when a detail translation is absent", async () => {
    const page = await html(
      "posts/security-group-connection-tracking/index.html"
    );

    expect(page).toContain('href="/en/posts/"');
    expect(page).toContain('hreflang="ko"');
    expect(page).toContain('hreflang="x-default"');
    expect(page).not.toContain(
      '<link rel="alternate" hreflang="en"'
    );
  });
});
