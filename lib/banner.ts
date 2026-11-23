import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { catalog } from "./catalog";
import { offerDates, type Creative } from "./model";
import { readBanner, readChoiceArt, readUpload, saveBanner, WorkflowError } from "./store";

const size = 1080;
const inset = 62;

export function artPath(file: string): string {
  return join(process.cwd(), "starter", file);
}

function markup(text: string): string {
  return text.replace(/[&<>]/g, character => {
    if (character === "&") return "&amp;";
    return character === "<" ? "&lt;" : "&gt;";
  });
}

async function textLayer(text: string, width: number, height: number, initial: number, bold: boolean): Promise<{ buffer: Buffer; width: number; height: number }> {
  let fontSize = initial;
  for (;;) {
    const { data, info } = await sharp({
      text: {
        text: `<span foreground="#ffffff">${markup(text)}</span>`,
        font: `DejaVu Sans ${bold ? "Bold " : ""}${fontSize}`,
        width, dpi: 72, wrap: "word-char", rgba: true,
      },
    }).png().toBuffer({ resolveWithObject: true });
    if (info.height <= height && info.width <= width) return { buffer: data, width: info.width, height: info.height };
    fontSize = Math.floor(fontSize * 0.85);
    if (fontSize < 8) throw new WorkflowError("invalid");
  }
}

export async function renderBanner(workspace: string, creative: Creative): Promise<string> {
  const key = createHash("sha256").update("banner-v1").update(JSON.stringify(creative)).digest("hex");
  if (readBanner(workspace, key)) return key;
  const scene = catalog.backgrounds.find(item => item.id === creative.backgroundId);
  const person = catalog.characters.find(item => item.id === creative.characterId);
  const upload = creative.uploadId ? readUpload(workspace, creative.uploadId) : undefined;
  if (creative.uploadId && !upload) throw new WorkflowError("invalid", { uploadId: "invalid" });
  const customScene = !scene && !upload ? readChoiceArt(workspace, creative.backgroundId) : undefined;
  const customCharacter = creative.characterId && !person ? readChoiceArt(workspace, creative.characterId) : undefined;
  const source = upload ? Buffer.from(upload) : scene ? artPath(scene.file) : customScene ? Buffer.from(customScene) : undefined;
  const foreground = person ? artPath(person.file) : customCharacter ? Buffer.from(customCharacter) : undefined;
  if (!source) throw new WorkflowError("invalid", { backgroundId: "required" });

  const dates = offerDates(creative);
  const [background, character, headline, button, period] = await Promise.all([
    sharp(source).resize(size, size, { fit: "cover" }).png().toBuffer(),
    foreground ? sharp(foreground).resize(size, size, { fit: "fill" }).png().toBuffer() : undefined,
    textLayer(creative.headline, 956, 300, 78, true),
    textLayer(creative.cta, 720, 56, 30, true),
    dates ? textLayer(dates, 956, 48, 31, false) : undefined,
  ]);
  const buttonHeight = 80;
  const buttonY = size - inset - buttonHeight;
  const periodY = buttonY - 32 - (period?.height ?? 0);
  const headlineY = periodY - headline.height - (period ? 26 : 0);
  const decoration = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <defs><linearGradient id="shade" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="32%" stop-color="#111018" stop-opacity="0"/><stop offset="100%" stop-color="#111018" stop-opacity=".98"/>
    </linearGradient></defs>
    <rect width="1080" height="1080" fill="url(#shade)"/>
    <rect x="${inset}" y="${buttonY}" width="${button.width + 66}" height="${buttonHeight}" rx="18" fill="#5141c4"/>
  </svg>`);
  const layers: OverlayOptions[] = [];
  if (character) layers.push({ input: character, left: 0, top: 0 });
  layers.push(
    { input: decoration },
    { input: headline.buffer, left: inset, top: headlineY },
    { input: button.buffer, left: inset + 33, top: buttonY + Math.floor((buttonHeight - button.height) / 2) },
  );
  if (period) layers.push({ input: period.buffer, left: inset, top: periodY });
  const png = await sharp(background).composite(layers).png().toBuffer();
  saveBanner(workspace, key, png);
  return key;
}
