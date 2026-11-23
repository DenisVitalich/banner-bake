import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { catalog, demo } from "./catalog";
import { performance } from "./analytics";
import { availableChoices, choicesSchema, defaultChoices, type Choice, type ChoiceChange, type Choices } from "./choices";
import { creativeSchema, deliveryActions, emptyCreative, statusSchema, validateCreative, type Creative, type DeliveryAction, type Status, type Upload, type Version, type VersionRef } from "./model";
import { regenerateCreative } from "./regeneration";

const rowSchema = z.object({
  id: z.string(), parentId: z.string().nullable(), rootId: z.string(),
  version: z.number(), revision: z.number(), status: z.union([statusSchema, z.enum(["pending", "returned", "approved"]).transform(() => "draft" as const)]),
  creative: z.string(),
  reason: z.string(), campaignId: z.string().nullable(), autoWindow: z.string().nullable(), updatedAt: z.string(),
});
type Row = z.infer<typeof rowSchema>;
const uploadSchema = z.object({ id: z.uuid(), name: z.string() });
const bytes = z.instanceof(Uint8Array);
const deliveryStatus = {
  pause: "paused", resume: "live", stop: "stopped", delete: "deleted",
} satisfies Record<DeliveryAction, Status>;
const demoOrder = new Map(demo.ads.map((ad, index) => [ad.id, index]));
let connection: DatabaseSync | undefined;

function database(): DatabaseSync {
  if (connection) return connection;
  const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? process.env.DATA_DIR ?? join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "creative.sqlite"), { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS versions (
      workspace TEXT NOT NULL, id TEXT NOT NULL, parentId TEXT, rootId TEXT NOT NULL,
      version INTEGER NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, creative TEXT NOT NULL,
      reason TEXT NOT NULL, campaignId TEXT, autoWindow TEXT, updatedAt TEXT NOT NULL,
      PRIMARY KEY(workspace, id), UNIQUE(workspace, parentId, autoWindow)
    );
    CREATE INDEX IF NOT EXISTS versions_lineage ON versions(workspace, rootId);
    CREATE TABLE IF NOT EXISTS uploads (
      workspace TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, image BLOB NOT NULL,
      PRIMARY KEY(workspace, id)
    );
    CREATE TABLE IF NOT EXISTS banners (
      workspace TEXT NOT NULL, id TEXT NOT NULL, image BLOB NOT NULL,
      PRIMARY KEY(workspace, id)
    );
    CREATE TABLE IF NOT EXISTS catalog_settings (
      workspace TEXT PRIMARY KEY, choices TEXT NOT NULL
    );
  `);
  if (db.prepare("PRAGMA user_version").get()?.user_version === 0) {
    transaction(migrateDemoCopy, db);
  }
  connection = db;
  return db;
}

export function health(): void {
  database().prepare("SELECT 1").get();
}

export function listChoices(workspace: string): Choices {
  const row = database().prepare("SELECT choices FROM catalog_settings WHERE workspace = ?").get(workspace);
  return typeof row?.choices === "string" ? choicesSchema.parse(JSON.parse(row.choices)) : defaultChoices;
}

export function changeChoices(workspace: string, change: ChoiceChange): Choices {
  return transaction(db => {
    const choices = listChoices(workspace);
    let next: Choices;
    if (change.action === "remove") {
      if (!choices.some(item => item.id === change.id && !item.archived)) throw new WorkflowError("missing");
      next = choices.map(item => item.id === change.id ? { ...item, archived: true } : item);
    } else {
      const { title, ...choice } = change.choice;
      if (choice.kind === "background" || choice.kind === "character") {
        if (!availableChoices(choices, "game").some(item => item.id === choice.gameId)) throw new WorkflowError("invalid");
        if (!readUpload(workspace, choice.uploadId)) throw new WorkflowError("invalid");
      }
      if (choice.kind === "background" && !availableChoices(choices, "theme").some(item => item.id === choice.themeId)) {
        throw new WorkflowError("invalid");
      }
      const added: Choice = { ...choice, id: randomUUID(), title: { ru: title, en: title }, archived: false };
      next = [...choices, added];
    }
    db.prepare("INSERT INTO catalog_settings VALUES (?, ?) ON CONFLICT(workspace) DO UPDATE SET choices = excluded.choices")
      .run(workspace, JSON.stringify(next));
    return next;
  });
}

export function readChoiceArt(workspace: string, id: string): Uint8Array | undefined {
  const choice = listChoices(workspace).find(item => item.id === id);
  return choice && (choice.kind === "background" || choice.kind === "character") && choice.uploadId
    ? readUpload(workspace, choice.uploadId) : undefined;
}

function transaction<T>(run: (db: DatabaseSync) => T, db = database()): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateDemoCopy(db: DatabaseSync): void {
  if (db.prepare("PRAGMA user_version").get()?.user_version !== 0) return;
  const update = db.prepare(`
    UPDATE versions
    SET creative = json_set(creative, '$.locale', 'en', '$.headline', ?, '$.post', ?, '$.cta', ?),
        revision = revision + 1
    WHERE id = ? AND rootId = id AND parentId IS NULL AND version = 1 AND status <> 'deleted'
      AND json_extract(creative, '$.locale') = 'ru'
      AND json_extract(creative, '$.headline') = ?
      AND json_extract(creative, '$.post') = ?
      AND json_extract(creative, '$.cta') = ?
      AND json_extract(creative, '$.offer') = ''
      AND json_extract(creative, '$.prize') = ''
      AND json_extract(creative, '$.entryRules') = ''
  `);
  for (const ad of demo.ads) {
    if (ad.creativeLocale !== "en") continue;
    const copy = catalog.copy.find(item => item.id === ad.copyId);
    if (!copy) throw new Error("Invalid fixture copy reference");
    update.run(copy.headline.en, copy.post.en, copy.cta.en, ad.id, copy.headline.ru, copy.post.ru, copy.cta.ru);
  }
  db.exec("PRAGMA user_version = 1");
}

function insert(db: DatabaseSync, workspace: string, row: Row): void {
  db.prepare(`INSERT INTO versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(workspace, row.id, row.parentId, row.rootId, row.version, row.revision, row.status, row.creative,
      row.reason, row.campaignId, row.autoWindow, row.updatedAt);
}

function seed(db: DatabaseSync, workspace: string, revisions?: ReadonlyMap<string, number>): void {
  const ids = new Set(db.prepare("SELECT id FROM versions WHERE workspace = ?").all(workspace).map(row => row.id));
  for (const ad of demo.ads) {
    if (ids.has(ad.id)) continue;
    const copy = catalog.copy.find(item => item.id === ad.copyId);
    const campaign = demo.campaigns.find(item => item.id === ad.campaignId);
    if (!copy || !campaign) throw new Error("Invalid fixture references");
    const locale = ad.creativeLocale;
    const creative: Creative = {
      ...emptyCreative(locale), gameId: copy.gameId, themeId: copy.themeId,
      backgroundId: copy.backgroundId, characterId: ad.characterId,
      headline: copy.headline[locale], post: copy.post[locale], cta: copy.cta[locale],
      flightStart: campaign.flightStart, flightEnd: campaign.flightEnd, platforms: ad.platforms,
    };
    insert(db, workspace, {
      id: ad.id, parentId: null, rootId: ad.id, version: 1, revision: revisions?.get(ad.id) ?? 1, status: ad.status,
      creative: JSON.stringify(creative), reason: "", campaignId: ad.campaignId, autoWindow: null, updatedAt: demo.asOf,
    });
  }
}

function decode(row: Row): Version {
  const stored: unknown = JSON.parse(row.creative);
  const creative = creativeSchema.parse(stored);
  if (typeof stored === "object" && stored && !("publicationId" in stored)) creative.publicationId = creative.type;
  return {
    id: row.id, rootId: row.rootId, parentId: row.parentId, version: row.version, revision: row.revision,
    status: row.status, creative,
    campaignId: row.campaignId, autoWindow: row.autoWindow, updatedAt: row.updatedAt,
  };
}

function rows(db: DatabaseSync, workspace: string): Row[] {
  return z.array(rowSchema).parse(db.prepare("SELECT * FROM versions WHERE workspace = ? ORDER BY rowid DESC").all(workspace));
}

function visibleVersions(versions: Row[]): Version[] {
  return versions.filter(row => row.status !== "deleted")
    .sort((a, b) => (demoOrder.get(a.id) ?? -1) - (demoOrder.get(b.id) ?? -1))
    .map(decode);
}

export function listVersions(workspace: string): Version[] {
  const db = database();
  const existing = rows(db, workspace);
  const ids = new Set(existing.map(row => row.id));
  const versions = demo.ads.every(ad => ids.has(ad.id)) ? existing : transaction(tx => {
    seed(tx, workspace);
    return rows(tx, workspace);
  });
  return visibleVersions(versions);
}

export function resetDemoVersions(workspace: string): Version[] {
  return transaction(db => {
    // Demo ads reuse their IDs. Advance the revisions so older tabs cannot act on restored rows.
    const revisions = new Map(rows(db, workspace).map(row => [row.id, row.revision + 1]));
    db.prepare("DELETE FROM versions WHERE workspace = ?").run(workspace);
    seed(db, workspace, revisions);
    return visibleVersions(rows(db, workspace));
  });
}

export class WorkflowError extends Error {
  constructor(public code: "missing" | "conflict" | "notAllowed" | "invalid", public fields = {}) {
    super(code);
  }
}

function find(db: DatabaseSync, workspace: string, id: string, revision: number): Row {
  const row = db.prepare("SELECT * FROM versions WHERE workspace = ? AND id = ?").get(workspace, id);
  if (!row || row.status === "deleted") throw new WorkflowError("missing");
  const result = rowSchema.parse(row);
  if (result.revision !== revision) throw new WorkflowError("conflict");
  return result;
}

function newDraft(db: DatabaseSync, workspace: string, creative: Creative, parent: Row | null, autoWindow: string | null = null): Row {
  const id = randomUUID();
  const rootId = parent?.rootId ?? id;
  const version = Number(db.prepare("SELECT COALESCE(MAX(version), 0) AS number FROM versions WHERE workspace = ? AND rootId = ?")
    .get(workspace, rootId)?.number ?? 0) + 1;
  const campaign = demo.campaigns.find(item => item.id === parent?.campaignId && item.gameId === creative.gameId);
  const row: Row = {
    id, rootId, parentId: parent?.id ?? null, status: "draft", creative: JSON.stringify(creative),
    version, revision: 1, reason: "", campaignId: campaign?.id ?? null, autoWindow, updatedAt: new Date().toISOString(),
  };
  insert(db, workspace, row);
  return row;
}

export function assertUpload(workspace: string, id: string | null): void {
  if (id && !database().prepare("SELECT 1 FROM uploads WHERE workspace = ? AND id = ?").get(workspace, id)) {
    throw new WorkflowError("invalid", { uploadId: "invalid" });
  }
}

function writeVersion(db: DatabaseSync, workspace: string, creative: Creative, ref: VersionRef | null): Row {
  if (!ref) return newDraft(db, workspace, creative, null);
  const row = find(db, workspace, ref.id, ref.revision);
  if (JSON.stringify(decode(row).creative) === JSON.stringify(creative)) return row;
  if (row.status !== "draft") return newDraft(db, workspace, creative, row);

  const campaign = demo.campaigns.find(item => item.id === row.campaignId && item.gameId === creative.gameId);
  row.creative = JSON.stringify(creative);
  row.campaignId = campaign?.id ?? null;
  row.revision += 1;
  row.updatedAt = new Date().toISOString();
  db.prepare("UPDATE versions SET creative = ?, campaignId = ?, status = ?, revision = ?, updatedAt = ? WHERE workspace = ? AND id = ?")
    .run(row.creative, row.campaignId, row.status, row.revision, row.updatedAt, workspace, row.id);
  return row;
}

export function saveVersion(workspace: string, creative: Creative, ref: VersionRef | null, launch = false): Version {
  return transaction(db => {
    seed(db, workspace);
    assertUpload(workspace, creative.uploadId);
    const fields = validateCreative(creative, launch, false, listChoices(workspace));
    if (Object.keys(fields).length) throw new WorkflowError("invalid", fields);
    const row = writeVersion(db, workspace, creative, ref);
    if (launch) {
      if (row.status !== "draft") throw new WorkflowError("notAllowed");
      const now = new Date().toISOString();
      db.prepare("UPDATE versions SET status = 'replaced', revision = revision + 1, updatedAt = ? WHERE workspace = ? AND rootId = ? AND status IN ('live', 'paused')")
        .run(now, workspace, row.rootId);
      updateStatus(db, workspace, row, "live", now);
    }
    return decode(row);
  });
}

export function createRegenerationDraft(workspace: string, ref: VersionRef): Version {
  return transaction(db => {
    const source = find(db, workspace, ref.id, ref.revision);
    const previous = decode(source);
    const { lowCtr } = performance(previous);
    if (source.status !== "live" || !lowCtr) throw new WorkflowError("notAllowed");

    const existing = db.prepare("SELECT * FROM versions WHERE workspace = ? AND parentId = ? AND autoWindow = ?")
      .get(workspace, source.id, lowCtr.window);
    if (existing && existing.status !== "deleted") return decode(rowSchema.parse(existing));

    const creative = regenerateCreative(previous.creative, listChoices(workspace));
    if (!creative) throw new WorkflowError("notAllowed");
    if (existing) {
      db.prepare("UPDATE versions SET autoWindow = NULL WHERE workspace = ? AND id = ?")
        .run(workspace, rowSchema.parse(existing).id);
    }
    return decode(newDraft(db, workspace, creative, source, lowCtr.window));
  });
}

function updateStatus(db: DatabaseSync, workspace: string, row: Row, status: Status, now: string): void {
  row.status = status;
  row.revision += 1;
  row.updatedAt = now;
  db.prepare("UPDATE versions SET status = ?, revision = ?, updatedAt = ? WHERE workspace = ? AND id = ?")
    .run(row.status, row.revision, row.updatedAt, workspace, row.id);
}

export function transition(workspace: string, id: string, revision: number, action: DeliveryAction): Version {
  return transaction(db => {
    const row = find(db, workspace, id, revision);
    if (!deliveryActions(row.status).includes(action)) throw new WorkflowError("notAllowed");
    updateStatus(db, workspace, row, deliveryStatus[action], new Date().toISOString());
    return decode(row);
  });
}

export function listUploads(workspace: string): Upload[] {
  return z.array(uploadSchema).parse(database().prepare("SELECT id, name FROM uploads WHERE workspace = ? ORDER BY rowid DESC").all(workspace));
}

export function saveUpload(workspace: string, name: string, image: Buffer): Upload {
  const id = randomUUID();
  database().prepare("INSERT INTO uploads VALUES (?, ?, ?, ?)").run(workspace, id, name, image);
  return { id, name };
}

export function readUpload(workspace: string, id: string): Uint8Array | undefined {
  const result = database().prepare("SELECT image FROM uploads WHERE workspace = ? AND id = ?").get(workspace, id);
  return result ? bytes.parse(result.image) : undefined;
}

export function readBanner(workspace: string, id: string): Uint8Array | undefined {
  const result = database().prepare("SELECT image FROM banners WHERE workspace = ? AND id = ?").get(workspace, id);
  return result ? bytes.parse(result.image) : undefined;
}

export function saveBanner(workspace: string, id: string, image: Buffer): void {
  database().prepare("INSERT OR IGNORE INTO banners VALUES (?, ?, ?)").run(workspace, id, image);
}
