import { renderBanner } from "./banner";
import { publication, validateCreative, type Creative, type ExportFormat } from "./model";
import { listChoices, readBanner, WorkflowError } from "./store";
import { t } from "./strings";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

export async function exportPost(workspace: string, creative: Creative, format: ExportFormat): Promise<Response> {
  const errors = format === "txt" ? {} : validateCreative(creative, true, true, listChoices(workspace));
  if (format !== "png" && !creative.post.trim()) Object.assign(errors, { post: "required" });
  if (Object.keys(errors).length) throw new WorkflowError("invalid", errors);

  const post = publication(creative);
  const platforms = creative.platforms.map(platform => t(creative.locale, `platform-${platform}`)).join(", ");
  const headers = {
    "Content-Disposition": `attachment; filename="creative.${format}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (format === "txt") {
    const text = [creative.headline, post, creative.cta, platforms && `${t(creative.locale, "platforms")}: ${platforms}`].filter(Boolean).join("\n\n");
    return new Response(text, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }

  const id = await renderBanner(workspace, creative);
  const banner = readBanner(workspace, id);
  if (!banner) throw new WorkflowError("missing");
  if (format === "png") return new Response(new Uint8Array(banner), { headers: { ...headers, "Content-Type": "image/png" } });

  const html = `<!doctype html>
<html lang="${creative.locale}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(creative.headline)}</title>
<style>body{font:1rem/1.6 system-ui,sans-serif;margin:2rem auto;padding:0 1rem;max-width:44rem;color:#222}img{display:block;max-width:100%;height:auto}h1,p{overflow-wrap:anywhere}p{white-space:pre-wrap}</style>
<main>
<h1>${escapeHtml(creative.headline)}</h1>
<img alt="${escapeHtml(creative.headline)}" width="1080" height="1080" src="data:image/png;base64,${Buffer.from(banner).toString("base64")}">
<p>${escapeHtml(post)}</p>
<p><strong>${escapeHtml(creative.cta)}</strong></p>
${platforms ? `<p>${escapeHtml(t(creative.locale, "platforms"))}: ${escapeHtml(platforms)}</p>` : ""}
</main>
</html>`;
  return new Response(html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
