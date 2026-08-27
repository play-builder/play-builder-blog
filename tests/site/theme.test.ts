import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("falls back to dark mode when the stored theme is invalid", async () => {
    expect(await initializeTheme("sepia")).toEqual({
      reflectedTheme: "dark",
      darkClassEnabled: true,
      exposedTheme: "dark",
    });
  });
});

type RuntimeThemeHarness = {
  clickThemeButton(): void;
  reflectedTheme(): string | undefined;
  darkClassEnabled(): boolean;
  storedTheme(): string | null;
  themeButtonLabel(): string | undefined;
  changeSystemTheme(matchesDark: boolean): void;
};

async function loadRuntimeTheme(
  initialStoredTheme: string | null
): Promise<RuntimeThemeHarness> {
  let currentStoredTheme = initialStoredTheme;
  let currentReflectedTheme: string | undefined;
  let currentDarkClassEnabled = false;
  let clickHandler: (() => void) | undefined;
  let systemThemeChangeHandler: ((event: { matches: boolean }) => void) | undefined;
  const buttonAttributes = new Map<string, string>();

  const button = {
    dataset: {
      labelLight: "Switch to light mode",
      labelDark: "Switch to dark mode",
    },
    setAttribute: (name: string, value: string) => {
      buttonAttributes.set(name, value);
    },
    addEventListener: (name: string, listener: () => void) => {
      if (name === "click") clickHandler = listener;
    },
  };
  const metaThemeColor = { setAttribute: () => undefined };
  const documentStub = {
    body: {},
    firstElementChild: {
      setAttribute: (name: string, value: string) => {
        if (name === "data-theme") currentReflectedTheme = value;
      },
      classList: {
        toggle: (_name: string, enabled: boolean) => {
          currentDarkClassEnabled = enabled;
        },
      },
    },
    querySelector: (selector: string) => {
      if (selector === "#theme-btn") return button;
      if (selector === "meta[name='theme-color']") return metaThemeColor;
      return null;
    },
    addEventListener: () => undefined,
  };
  const windowStub = {
    getComputedStyle: () => ({ backgroundColor: "rgb(33, 39, 55)" }),
    matchMedia: () => ({
      addEventListener: (
        name: string,
        listener: (event: { matches: boolean }) => void
      ) => {
        if (name === "change") systemThemeChangeHandler = listener;
      },
    }),
  };

  vi.stubGlobal("localStorage", {
    getItem: () => currentStoredTheme,
    setItem: (_key: string, value: string) => {
      currentStoredTheme = value;
    },
  });
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", windowStub);
  vi.resetModules();
  await import("@/scripts/theme");

  return {
    clickThemeButton: () => {
      if (!clickHandler) throw new Error("Theme button click handler was not registered");
      clickHandler();
    },
    reflectedTheme: () => currentReflectedTheme,
    darkClassEnabled: () => currentDarkClassEnabled,
    storedTheme: () => currentStoredTheme,
    themeButtonLabel: () => buttonAttributes.get("aria-label"),
    changeSystemTheme: matchesDark =>
      systemThemeChangeHandler?.({ matches: matchesDark }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("theme button", () => {
  it("switches the default dark theme to light and persists it", async () => {
    const theme = await loadRuntimeTheme(null);

    expect(theme.themeButtonLabel()).toBe("Switch to light mode");

    theme.clickThemeButton();

    expect(theme.reflectedTheme()).toBe("light");
    expect(theme.darkClassEnabled()).toBe(false);
    expect(theme.storedTheme()).toBe("light");
    expect(theme.themeButtonLabel()).toBe("Switch to dark mode");
  });

  it("starts in dark mode when the stored theme is invalid", async () => {
    const theme = await loadRuntimeTheme("sepia");

    expect(theme.reflectedTheme()).toBe("dark");
    expect(theme.darkClassEnabled()).toBe(true);
  });

  it("keeps an explicit light selection when the system theme changes", async () => {
    const theme = await loadRuntimeTheme("light");

    theme.changeSystemTheme(true);

    expect(theme.reflectedTheme()).toBe("light");
    expect(theme.darkClassEnabled()).toBe(false);
    expect(theme.storedTheme()).toBe("light");
  });
});
