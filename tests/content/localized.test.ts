import { describe, expect, it } from "vitest";
import {
  filterByLocale,
  findTranslation,
  localizedEntryId,
} from "@/content/localized";

const entries = [
  {
    id: "ko-first",
    data: { locale: "ko" as const, translationKey: "shared-first" },
  },
  {
    id: "en-first",
    data: { locale: "en" as const, translationKey: "shared-first" },
  },
  {
    id: "ko-second",
    data: { locale: "ko" as const, translationKey: "korean-only" },
  },
];

describe("localized content helpers", () => {
  it("filters entries by exact locale without changing their order", () => {
    expect(filterByLocale(entries, "ko").map(entry => entry.id)).toEqual([
      "ko-first",
      "ko-second",
    ]);
    expect(filterByLocale(entries, "en").map(entry => entry.id)).toEqual([
      "en-first",
    ]);
  });

  it("does not mutate the input collection", () => {
    const before = entries.map(entry => entry.id);

    filterByLocale(entries, "ko");

    expect(entries.map(entry => entry.id)).toEqual(before);
  });

  it("finds a translation only when both key and target locale match", () => {
    expect(findTranslation(entries, "shared-first", "en")?.id).toBe(
      "en-first"
    );
    expect(findTranslation(entries, "shared-first", "ko")?.id).toBe(
      "ko-first"
    );
  });

  it("returns undefined when the target locale has no translation", () => {
    expect(findTranslation(entries, "korean-only", "en")).toBeUndefined();
  });

  it("includes locale and parent slugs in generated collection IDs", () => {
    expect(
      localizedEntryId(
        "courses/ko/ethereum-validator-operations.json",
        "courses"
      )
    ).toBe("ko/ethereum-validator-operations");
    expect(
      localizedEntryId(
        "lessons/en/ethereum-validator-operations/install-clients.md",
        "lessons"
      )
    ).toBe("en/ethereum-validator-operations/install-clients");
  });

  it("normalizes Windows separators before generating an ID", () => {
    expect(
      localizedEntryId(
        "lessons\\ko\\ethereum-validator-operations\\verify-sync.md",
        "lessons"
      )
    ).toBe("ko/ethereum-validator-operations/verify-sync");
  });

  it("rejects an entry outside the configured collection directory", () => {
    expect(() => localizedEntryId("posts/ko/example.md", "lessons")).toThrow(
      /posts\/ko\/example.md.*lessons/
    );
  });
});
