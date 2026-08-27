const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";
type Theme = typeof LIGHT | typeof DARK;

export {};

function getPreferredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === LIGHT || stored === DARK ? stored : DARK;
}

// Reuse the value already set by the inline FOUC-prevention script if available.
let themeValue: Theme =
  (window as unknown as { __theme?: { value: Theme } }).__theme?.value ??
  getPreferredTheme();

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  const root = document.firstElementChild;
  root?.setAttribute("data-theme", themeValue);
  root?.classList.toggle("dark", themeValue === DARK);
  const themeButton = document.querySelector<HTMLButtonElement>("#theme-btn");
  const buttonLabel =
    themeValue === DARK
      ? themeButton?.dataset.labelLight
      : themeButton?.dataset.labelDark;
  if (buttonLabel) themeButton?.setAttribute("aria-label", buttonLabel);

  // Fill <meta name="theme-color"> with the computed background colour so
  // Android's browser chrome matches the page background.
  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

function setup(): void {
  reflect();
  document.querySelector("#theme-btn")?.addEventListener("click", () => {
    themeValue = themeValue === LIGHT ? DARK : LIGHT;
    persist();
  });
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", setup);

// Carry the theme-color value across View Transitions to prevent the
// Android navigation bar from flashing during page transitions.
document.addEventListener("astro:before-swap", event => {
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color) {
    (event as { newDocument: Document }).newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});
