import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { preferredLocale } from "../lib/strings";
import "./styles.css";

export const metadata: Metadata = {
  title: "Banner Bake",
  description: "A bilingual workspace for creating, launching and evaluating game ads.",
  icons: { icon: { url: "/favicon.ico", type: "image/x-icon" } },
};

export default async function Layout({ children }: { children: ReactNode }): Promise<React.JSX.Element> {
  const prefs = await cookies();
  const locale = preferredLocale(prefs.get("creative-locale")?.value, (await headers()).get("accept-language") ?? "");
  const theme = prefs.get("creative-theme")?.value === "dark" ? "dark" : "light";
  return <html lang={locale} data-theme={theme}><body>{children}</body></html>;
}
