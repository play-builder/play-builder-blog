import { describe, expect, it } from "vitest";
import astroConfig from "../../astro.config";
import siteConfig from "../../astro-paper.config";

describe("Astro locale configuration", () => {
  it("uses unprefixed Korean as the default and prefixes English", () => {
    const i18n = (astroConfig as {
      i18n?: {
        locales?: string[];
        defaultLocale?: string;
        routing?: { prefixDefaultLocale?: boolean };
      };
    }).i18n;

    expect(i18n?.locales).toEqual(["ko", "en"]);
    expect(i18n?.defaultLocale).toBe("ko");
    expect(i18n?.routing?.prefixDefaultLocale).toBe(false);
  });

  it("uses Korean for pages without an explicit locale", () => {
    expect(siteConfig.site.lang).toBe("ko");
  });
});
