import { describe, expect, it } from "vitest";
import { getPostSlug } from "@/utils/getPostSlug";

describe("localized Post storage paths", () => {
  it("preserves the existing slug for a root Korean Post", () => {
    expect(
      getPostSlug(
        "security-group-connection-tracking",
        "src/content/posts/security-group-connection-tracking.md"
      )
    ).toBe("/security-group-connection-tracking");
  });

  it("removes the leading English storage locale from the public slug", () => {
    expect(
      getPostSlug(
        "en/security-group-connection-tracking",
        "src/content/posts/en/security-group-connection-tracking.md"
      )
    ).toBe("/security-group-connection-tracking");
  });

  it("accepts a future leading Korean storage directory without changing the URL", () => {
    expect(
      getPostSlug(
        "ko/security-group-connection-tracking",
        "src/content/posts/ko/security-group-connection-tracking.md"
      )
    ).toBe("/security-group-connection-tracking");
  });

  it("does not strip a locale-like segment nested below another directory", () => {
    expect(
      getPostSlug(
        "guides/en/security-group-connection-tracking",
        "src/content/posts/guides/en/security-group-connection-tracking.md"
      )
    ).toBe("/guides/en/security-group-connection-tracking");
  });
});
