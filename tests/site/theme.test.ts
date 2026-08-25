import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const dist = new URL("../../dist/", import.meta.url);

const inlineThemeScript = async () => {
  const html = await readFile(new URL("index.html", dist), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const script = scripts.map(match => match[1]).find(code =>
    code.includes("window.__theme")
  );
  if (!script) throw new Error("Inline theme initializer was not built");
  return script;
};

const initializeTheme = async (storedTheme: string | null) => {
  let reflectedTheme: string | undefined;
  let darkClassEnabled = false;
  const browserWindow: { __theme?: { value: string }; matchMedia: () => object } = {
    matchMedia: () => ({ matches: false }),
  };

  runInNewContext(await inlineThemeScript(), {
    localStorage: { getItem: () => storedTheme },
    window: browserWindow,
    document: {
      firstElementChild: {
        setAttribute: (name: string, value: string) => {
          if (name === "data-theme") reflectedTheme = value;
        },
        classList: {
          toggle: (_name: string, enabled: boolean) => {
            darkClassEnabled = enabled;
          },
        },
      },
    },
  });

  return {
    reflectedTheme,
    darkClassEnabled,
    exposedTheme: browserWindow.__theme?.value,
  };
};

describe("initial theme", () => {
  it("defaults a first-time visitor to dark mode", async () => {
    expect(await initializeTheme(null)).toEqual({
      reflectedTheme: "dark",
      darkClassEnabled: true,
      exposedTheme: "dark",
    });
  });

  it("preserves a visitor's stored light preference", async () => {
    expect(await initializeTheme("light")).toEqual({
      reflectedTheme: "light",
      darkClassEnabled: false,
      exposedTheme: "light",
    });
  });
});
