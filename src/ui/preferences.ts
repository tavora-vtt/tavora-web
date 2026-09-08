import { ref } from "vue";

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";

const THEME_KEY = "tavora-theme";
const DENSITY_KEY = "tavora-density";

export const theme = ref<Theme>("system");
export const density = ref<Density>("comfortable");

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // a viewer with site data blocked keeps the preference for this visit only
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setTheme(next: Theme) {
  theme.value = next;
  if (next === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", next);
  }
  remember(THEME_KEY, next);
}

export function setDensity(next: Density) {
  density.value = next;
  if (next === "comfortable") {
    document.documentElement.removeAttribute("data-density");
  } else {
    document.documentElement.setAttribute("data-density", next);
  }
  remember(DENSITY_KEY, next);
}

/** restorePreferences applies what the viewer chose last, before the first paint. */
export function restorePreferences() {
  const storedTheme = recall(THEME_KEY);
  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
    setTheme(storedTheme);
  }

  const storedDensity = recall(DENSITY_KEY);
  if (storedDensity === "comfortable" || storedDensity === "compact") {
    setDensity(storedDensity);
  }
}
