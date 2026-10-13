/** Theme constants shared by the layout's inline script and ThemeToggle. Client-safe. */
export type Theme = "day" | "bedtime";

export const THEME_STORAGE_KEY = "mystory-theme";
export const THEME_ATTRIBUTE = "data-theme";
/** Fired on window after the theme changes: `new CustomEvent<Theme>(THEME_EVENT, { detail })`. */
export const THEME_EVENT = "mystory:theme";

export function readTheme(): Theme {
  if (typeof document === "undefined") return "day";
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === "bedtime" ? "bedtime" : "day";
}

/** Applies the theme to <html>, remembers it on this device and notifies listeners. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this page.
  }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

/** Runs before first paint (inlined in <head>) so the saved theme never flashes. */
export const THEME_INIT_SCRIPT =
  "(function(){var d=document.documentElement;try{var t=localStorage.getItem('" +
  THEME_STORAGE_KEY +
  "');d.setAttribute('" +
  THEME_ATTRIBUTE +
  "',t==='bedtime'?'bedtime':'day')}catch(e){d.setAttribute('" +
  THEME_ATTRIBUTE +
  "','day')}})()";
