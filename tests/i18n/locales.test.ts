import { describe, expect, it } from "vitest";
import {
  CONTENT_LOCALES,
  DEFAULT_LOCALE,
  TRANSLATION_KEY_PATTERN,
  isContentLocale,
  otherLocale,
} from "@/i18n/locales";

describe("content locale contract", () => {
  it("uses Korean and English with Korean as the default", () => {
    expect(CONTENT_LOCALES).toEqual(["ko", "en"]);
    expect(DEFAULT_LOCALE).toBe("ko");
  });

  it.each([
    ["ko", true],
    ["en", true],
    ["kr", false],
    ["KO", false],
    ["", false],
    [null, false],
    [42, false],
  ])("recognizes %j as a supported locale: %s", (value, supported) => {
    expect(isContentLocale(value)).toBe(supported);
  });

  it("returns the other supported locale", () => {
    expect(otherLocale("ko")).toBe("en");
    expect(otherLocale("en")).toBe("ko");
  });

  it.each([
    ["aws-cloudops-s3", true],
    ["s3", true],
    ["AWS-cloudops", false],
    ["aws cloudops", false],
    ["aws_cloudops", false],
    ["-aws-cloudops", false],
    ["aws-cloudops-", false],
    ["", false],
  ])("validates translation key %j: %s", (value, valid) => {
    expect(TRANSLATION_KEY_PATTERN.test(value)).toBe(valid);
  });
});
