import { describe, expect, it } from "vitest";
import { useTranslations } from "@/i18n";

describe("UI translation selection", () => {
  it("loads a distinct Korean dictionary", () => {
    expect(useTranslations("ko")).not.toBe(useTranslations("en"));
    expect(useTranslations("ko").nav.posts).toBe("기술 블로그");
  });

  it("uses Korean when locale is omitted", () => {
    expect(useTranslations()).toBe(useTranslations("ko"));
  });

  it("falls back to Korean for an unsupported locale", () => {
    expect(useTranslations("fr")).toBe(useTranslations("ko"));
  });
});
