import { readFile } from "node:fs/promises";
import { z } from "zod";
import sharp from "sharp";
import { NextResponse, type NextRequest } from "next/server";
import { catalog } from "../../../lib/catalog";
import { choiceChangeSchema } from "../../../lib/choices";
import { actionSchema, creativeSchema, exportFormatSchema, validateCreative, type Upload } from "../../../lib/model";
import { artPath, renderBanner } from "../../../lib/banner";
import { exportPost } from "../../../lib/post-export";
import { changeChoices, createRegenerationDraft, health, listChoices, listUploads, listVersions, readBanner, readChoiceArt, readUpload, resetDemoVersions, saveUpload, saveVersion, transition, WorkflowError } from "../../../lib/store";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const ref = z.object({ id: z.string().max(80), revision: z.number().int().positive() });
const saveBody = z.object({ creative: creativeSchema, ref: ref.nullable() });
const transitionBody = ref.extend({ action: actionSchema });
const resetDemoBody = z.object({ confirm: z.literal(true) });
const exportBody = z.object({ creative: creativeSchema, format: exportFormatSchema });
const maxUpload = 8 * 1024 * 1024;
const maxJson = 64 * 1024;

class BodyTooLarge extends Error {}

function workspace(request: NextRequest): string {
  return z.uuid().parse(request.headers.get("x-creative-workspace"));
}

function fail(error: unknown): NextResponse {
  if (error instanceof BodyTooLarge) return NextResponse.json({ error: "invalid" }, { status: 413 });
  if (error instanceof WorkflowError) {
    const status = { missing: 404, conflict: 409, notAllowed: 403, invalid: 422 }[error.code];
    return NextResponse.json({ error: error.code, fields: error.fields }, { status });
  }
  if (error instanceof z.ZodError) {
    const fields = Object.fromEntries(error.issues.map(issue => [issue.path[0] === "creative" ? issue.path[1] : issue.path[0], "invalid"]));
    return NextResponse.json({ error: "invalid", fields }, { status: 422 });
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: "invalid" }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "server" }, { status: 500 });
}

function limitedBody(request: NextRequest, maxBytes: number): Response {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new BodyTooLarge();
  let bytesRead = 0;
  const body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, stream) {
      bytesRead += chunk.byteLength;
      if (bytesRead > maxBytes) stream.error(new BodyTooLarge());
      else stream.enqueue(chunk);
    },
  }));
  const contentType = request.headers.get("content-type");
  return new Response(body, { headers: contentType ? { "Content-Type": contentType } : undefined });
}

function readJson(request: NextRequest): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new WorkflowError("invalid");
  }
  return limitedBody(request, maxJson).json();
}

async function uploadImage(owner: string, request: NextRequest): Promise<Upload> {
  let name: string;
  let image: Buffer;
  try {
    const file = (await limitedBody(request, maxUpload + 64 * 1024).formData()).get("image");
    if (!(file instanceof File) || !file.size || file.size > maxUpload) throw new Error("Invalid image size");
    const decoded = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20_000_000 });
    const metadata = await decoded.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    image = await decoded.rotate().resize(1080, 1080, { fit: "cover" }).png().toBuffer();
    name = file.name.slice(0, 160);
  } catch (error) {
    if (error instanceof BodyTooLarge) throw error;
    throw new WorkflowError("invalid", { uploadId: "invalid" });
  }
  return saveUpload(owner, name, image);
}

function png(image: Uint8Array, cache: string, id?: string): Response {
  const headers = new Headers({ "Content-Type": "image/png", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
  if (id) headers.set("Content-Disposition", `attachment; filename="creative-${id.slice(0, 12)}.png"`);
  return new Response(new Uint8Array(image), { headers });
}

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  try {
    const [route, id, ...rest] = (await context.params).path;
    if (rest.length) throw new WorkflowError("missing");
    if (route === "health" && !id) {
      health();
      return NextResponse.json({ ok: true });
    }
    if (route === "art") {
      const layer = [...catalog.backgrounds, ...catalog.characters].find(item => item.id === id);
      if (layer) return png(await readFile(artPath(layer.file)), "public, max-age=86400");
      const image = id ? readChoiceArt(workspace(request), id) : undefined;
      if (!image) throw new WorkflowError("missing");
      return png(image, "private, no-store");
    }
    const owner = workspace(request);
    if (route === "workspace" && !id) return NextResponse.json({ versions: listVersions(owner), uploads: listUploads(owner), choices: listChoices(owner) }, { headers: { "Cache-Control": "private, no-store" } });
    if ((route === "upload" || route === "banner") && id) {
      const image = route === "upload" ? readUpload(owner, id) : readBanner(owner, id);
      if (!image) throw new WorkflowError("missing");
      return png(image, "private, no-store", route === "banner" ? id : undefined);
    }
    throw new WorkflowError("missing");
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  try {
    const [route, ...rest] = (await context.params).path;
    if (rest.length) throw new WorkflowError("missing");
    const owner = workspace(request);
    switch (route) {
      case "choices": return NextResponse.json(changeChoices(owner, choiceChangeSchema.parse(await readJson(request))));
      case "regenerate": return NextResponse.json(createRegenerationDraft(owner, ref.parse(await readJson(request))));
      case "reset-demo": {
        resetDemoBody.parse(await readJson(request));
        return NextResponse.json(resetDemoVersions(owner));
      }
      case "save":
      case "launch": {
        const { creative, ref } = saveBody.parse(await readJson(request));
        return NextResponse.json(saveVersion(owner, creative, ref, route === "launch"));
      }
      case "transition": {
        const { id, revision, action } = transitionBody.parse(await readJson(request));
        return NextResponse.json(transition(owner, id, revision, action));
      }
      case "export": {
        const { creative, format } = exportBody.parse(await readJson(request));
        return await exportPost(owner, creative, format);
      }
      case "banner": {
        const creative = creativeSchema.parse(await readJson(request));
        const errors = validateCreative(creative, true, true, listChoices(owner));
        if (Object.keys(errors).length) throw new WorkflowError("invalid", errors);
        return NextResponse.json({ id: await renderBanner(owner, creative) });
      }
      case "upload": return NextResponse.json(await uploadImage(owner, request));
      default: throw new WorkflowError("missing");
    }
  } catch (error) { return fail(error); }
}
