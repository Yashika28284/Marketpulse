import React, { createContext, useContext, useEffect, useState } from 'react';

/**
 * Minimal stand-in for the `next-themes` package's `useTheme()` API
 * (theme, setTheme), for apps that aren't running Next.js. Components
 * copied from shadcn-style registries commonly import `useTheme` from
 * `next-themes` — this gives them the same shape without pulling in a
 * Next.js-specific dependency that wouldn't work here anyway.
 *
 * Persists to localStorage and toggles a `.dark` class on <html>, which
 * is what the Tailwind v4 `@custom-variant dark` rule in index.css keys
 * off of.
 */
type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (next: Theme) => setThemeState(next);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
