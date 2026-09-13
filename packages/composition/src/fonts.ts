import "@fontsource/crimson-pro/500.css";
import "@fontsource/crimson-pro/600.css";
import "@fontsource/crimson-pro/700.css";
import "@fontsource/karla/400.css";
import "@fontsource/karla/600.css";

export type FontStatus = "ready" | "loading" | "unavailable";

/** Fontsource ships these weights with the app; this is intentionally not a device-font probe. */
export function bundledFontStatus(): FontStatus {
  if (typeof document === "undefined" || !document.fonts) return "ready";
  return document.fonts.status === "loaded" ? "ready" : "loading";
}

export const AURELIUS_FONT_STACKS = {
  heading: '"Crimson Pro", Georgia, "Times New Roman", serif',
  body: 'Karla, ui-sans-serif, system-ui, sans-serif',
} as const;
