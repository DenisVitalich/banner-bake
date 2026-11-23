import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Workspace } from "../components/workspace";
import { localDate } from "../lib/model";
import { preferredLocale } from "../lib/strings";
import { listChoices, listUploads, listVersions } from "../lib/store";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ edit?: string | string[]; view?: string | string[] }> }): Promise<React.JSX.Element> {
  const req = await headers();
  const token = z.uuid().safeParse(req.get("x-creative-workspace"));
  if (!token.success) notFound();
  const prefs = await cookies();
  const locale = preferredLocale(prefs.get("creative-locale")?.value, req.get("accept-language") ?? "");
  const versions = listVersions(token.data);
  const { edit, view } = await searchParams;
  const screen = typeof edit === "string" && (edit === "new" || versions.some(version => version.id === edit)) ? edit : null;
  return <Workspace locale={locale} editor={view === "analytics" || view === "settings" ? view : screen} dark={prefs.get("creative-theme")?.value !== "light"} today={localDate()}
    versions={versions} choices={listChoices(token.data)} uploads={listUploads(token.data)} />;
}
