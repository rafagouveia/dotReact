import { createContext, useContext, type ReactNode } from "react";

export type Locale = "pt" | "en";

const LocaleContext = createContext<Locale>("pt");

export function detectLocale(): Locale {
  const saved = localStorage.getItem("dotreact-locale");
  if (saved === "pt" || saved === "en") return saved;
  const browserLocale = navigator.languages?.[0] ?? navigator.language;
  if (browserLocale.toLowerCase().startsWith("en")) return "en";
  return "pt";
}

export function LocaleProvider({ locale, children }: { readonly locale: Locale; readonly children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

