import { describe, expect, it } from "vitest";
import {
  detailPath,
  localePrefix,
  localizedPath,
  sectionPath,
  translationTarget,
} from "@/i18n/urls";

describe("localized public URLs", () => {
  it("keeps Korean unprefixed and prefixes English", () => {
    expect(localePrefix("ko")).toBe("");
    expect(localePrefix("en")).toBe("/en");
  });

  it.each([
    ["ko", "home", "/"],
    ["en", "home", "/en/"],
    ["ko", "posts", "/posts/"],
    ["en", "posts", "/en/posts/"],
    ["ko", "courses", "/courses/"],
    ["en", "courses", "/en/courses/"],
    ["ko", "search", "/search/"],
    ["en", "search", "/en/search/"],
    ["ko", "tags", "/tags/"],
    ["en", "archives", "/en/archives/"],
    ["ko", "about", "/about/"],
    ["en", "about", "/en/about/"],
  ] as const)("maps %s %s to %s", (locale, section, expected) => {
    expect(sectionPath(locale, section)).toBe(expected);
  });

  it("normalizes path separators and trailing slashes once", () => {
    expect(localizedPath("ko", "/posts//")).toBe("/posts/");
    expect(localizedPath("en", "//courses/example/")).toBe(
      "/en/courses/example/"
    );
  });

  it("builds localized Post, Course, and Lesson detail paths", () => {
    expect(detailPath("ko", "posts", "security-group")).toBe(
      "/posts/security-group/"
    );
    expect(detailPath("en", "posts", "security-group")).toBe(
      "/en/posts/security-group/"
    );
    expect(detailPath("ko", "courses", "aws-cloudops")).toBe(
      "/courses/aws-cloudops/"
    );
    expect(
      detailPath("en", "courses", "aws-cloudops", "s3-replication")
    ).toBe("/en/courses/aws-cloudops/s3-replication/");
  });

  it("uses the matching detail translation when it exists", () => {
    expect(
      translationTarget(
        "en",
        "/en/posts/security-group/",
        "posts"
      )
    ).toBe("/en/posts/security-group/");
  });

  it("falls back to the target locale list when detail translation is missing", () => {
    expect(translationTarget("en", undefined, "posts")).toBe("/en/posts/");
    expect(translationTarget("ko", undefined, "courses")).toBe("/courses/");
  });
});
