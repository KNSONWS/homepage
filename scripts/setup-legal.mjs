#!/usr/bin/env node
/**
 * WOMS Rechtliches – Appwrite-Setup (idempotent).
 * Legt die Sammlungen legalDocuments, legalVersions, providerContracts, den Bucket
 * legal-files und die festen Rechtstext-Karten an. Versionen und Dateien bekommen
 * bewusst keine Loeschrechte: das Archiv soll vollstaendig bleiben.
 *
 * Usage:
 *   node scripts/setup-legal.mjs --dry-run
 *   APPWRITE_API_KEY=... node scripts/setup-legal.mjs
 */

import { pathToFileURL } from "node:url";

const dryRun = process.argv.includes("--dry-run");
const endpoint = process.env.APPWRITE_ENDPOINT || "https://appwrite.webklar.com/v1";
const projectId = process.env.APPWRITE_PROJECT_ID || "6a1058610003c5a13a05";
const databaseId = process.env.APPWRITE_DATABASE_ID || "woms-database";
const apiKey = process.env.APPWRITE_API_KEY;

const READ_WRITE = ['read("users")', 'create("users")', 'update("users")'];
const CRUD = [...READ_WRITE, 'delete("users")'];

const date = (key) => ({ key, type: "string", size: 10 });

export const COLLECTIONS = [
  {
    id: "legalDocuments",
    name: "Rechtstexte",
    perms: READ_WRITE,
    attrs: [
      { key: "key", type: "string", size: 64, required: true },
      { key: "title", type: "string", size: 200, required: true },
      { key: "liveUrl", type: "string", size: 500 },
      { key: "sort", type: "integer", min: 0, max: 1000 },
    ],
    indexes: [{ key: "idx_sort", type: "key", attributes: ["sort"] }],
  },
  {
    id: "legalVersions",
    name: "Rechtstext-Versionen",
    perms: READ_WRITE,
    attrs: [
      { key: "documentKey", type: "string", size: 64, required: true },
      { key: "version", type: "string", size: 32, required: true },
      date("validFrom"),
      date("validTo"),
      { key: "status", type: "enum", elements: ["draft", "current", "superseded"], required: true },
      { key: "changeNote", type: "string", size: 5000 },
      { key: "fileIds", type: "string[]", size: 64 },
      { key: "source", type: "string", size: 300 },
    ],
    indexes: [
      { key: "idx_documentKey", type: "key", attributes: ["documentKey"] },
      { key: "idx_source", type: "key", attributes: ["source"] },
    ],
  },
  {
    id: "providerContracts",
    name: "Anbieter-Verträge",
    perms: CRUD,
    attrs: [
      { key: "provider", type: "string", size: 200, required: true },
      { key: "purpose", type: "string", size: 300 },
      { key: "cost", type: "float" },
      { key: "costInterval", type: "enum", elements: ["month", "year"] },
      date("startDate"),
      { key: "termMonths", type: "integer", min: 0, max: 1200 },
      { key: "renewalMonths", type: "integer", min: 0, max: 1200 },
      { key: "noticeValue", type: "integer", min: 0, max: 3650 },
      { key: "noticeUnit", type: "enum", elements: ["days", "months"] },
      date("cancelledAt"),
      date("endsAt"),
      { key: "note", type: "string", size: 5000 },
      { key: "fileIds", type: "string[]", size: 64 },
    ],
    indexes: [{ key: "idx_provider", type: "key", attributes: ["provider"] }],
  },
];

export const BUCKET = {
  id: "legal-files",
  name: "Rechtliches Dateien",
  perms: ['read("users")', 'create("users")'],
  maxSize: 20 * 1024 * 1024,
  extensions: ["pdf", "html", "htm", "png", "jpg", "jpeg", "webp", "doc", "docx"],
};

export const DOCUMENTS = [
  { key: "agb", title: "AGB", liveUrl: "https://webklar.com/agb" },
  { key: "abo-bedingungen", title: "Abo-Bedingungen", liveUrl: "https://project.webklar.com/abo-bedingungen.html" },
  { key: "avv", title: "AVV (Auftragsverarbeitung)", liveUrl: "https://project.webklar.com/abo-bedingungen.html" },
  { key: "datenschutz", title: "Datenschutzerklärung (Website und Portal)", liveUrl: "https://project.webklar.com/datenschutz.html" },
  { key: "impressum", title: "Impressum", liveUrl: "https://webklar.com/impressum" },
  { key: "widerruf", title: "Widerrufsbelehrung und -formular", liveUrl: "https://project.webklar.com/widerrufen.html" },
].map((d, i) => ({ ...d, sort: i + 1 }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wartet, bis Appwrite alle Attribute einer Sammlung fertig angelegt hat. */
export async function waitForAttributes(db, collectionId, { intervalMs = 1000, timeoutMs = 120000 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const { attributes } = await db.listAttributes(databaseId, collectionId);
    const failed = attributes.filter((a) => a.status === "failed" || a.status === "stuck");
    if (failed.length) {
      throw new Error(`Attribut fehlgeschlagen in ${collectionId}: ${failed.map((a) => `${a.key} (${a.error || a.status})`).join(", ")}`);
    }
    if (attributes.every((a) => a.status === "available")) return;
    if (Date.now() > until) throw new Error(`Attribute in ${collectionId} nach ${timeoutMs} ms nicht verfuegbar`);
    await sleep(intervalMs);
  }
}

async function createAttribute(db, collectionId, a) {
  const req = Boolean(a.required);
  switch (a.type) {
    case "integer":
      return db.createIntegerAttribute(databaseId, collectionId, a.key, req, a.min, a.max);
    case "float":
      return db.createFloatAttribute(databaseId, collectionId, a.key, req);
    case "enum":
      return db.createEnumAttribute(databaseId, collectionId, a.key, a.elements, req);
    case "string[]":
      return db.createStringAttribute(databaseId, collectionId, a.key, a.size, req, undefined, true);
    default:
      return db.createStringAttribute(databaseId, collectionId, a.key, a.size, req);
  }
}

async function run() {
  if (dryRun) {
    for (const c of COLLECTIONS) {
      console.log(`Sammlung ${c.id} (${c.perms.join(", ")}): ${c.attrs.map((a) => a.key).join(", ")}`);
    }
    console.log(`Bucket ${BUCKET.id}: ${BUCKET.extensions.join(", ")}, max ${BUCKET.maxSize} Bytes`);
    for (const d of DOCUMENTS) console.log(`Rechtstext ${d.key}: ${d.title}`);
    return;
  }
  if (!apiKey) {
    console.error("APPWRITE_API_KEY required (oder --dry-run)");
    process.exit(1);
  }
  const { Client, Databases, Storage } = await import("node-appwrite");
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const db = new Databases(client);
  const storage = new Storage(client);

  for (const c of COLLECTIONS) {
    try {
      await db.getCollection(databaseId, c.id);
      await db.updateCollection(databaseId, c.id, c.name, c.perms, false, true);
      console.log("Sammlung vorhanden:", c.id);
    } catch (e) {
      if (e.code !== 404) throw e;
      await db.createCollection(databaseId, c.id, c.name, c.perms, false, true);
      console.log("Sammlung angelegt:", c.id);
    }
    const existing = new Set((await db.listAttributes(databaseId, c.id)).attributes.map((a) => a.key));
    for (const a of c.attrs) {
      if (existing.has(a.key)) continue;
      await createAttribute(db, c.id, a);
      console.log("  Attribut", a.key);
      await sleep(400);
    }
    await waitForAttributes(db, c.id);
    const indexes = new Set((await db.listIndexes(databaseId, c.id)).indexes.map((i) => i.key));
    for (const idx of c.indexes || []) {
      if (indexes.has(idx.key)) continue;
      await db.createIndex(databaseId, c.id, idx.key, idx.type, idx.attributes);
      console.log("  Index", idx.key);
    }
  }

  try {
    await storage.getBucket(BUCKET.id);
    console.log("Bucket vorhanden:", BUCKET.id);
  } catch (e) {
    if (e.code !== 404) throw e;
    await storage.createBucket(BUCKET.id, BUCKET.name, BUCKET.perms, false, true, BUCKET.maxSize, BUCKET.extensions);
    console.log("Bucket angelegt:", BUCKET.id);
  }

  for (const d of DOCUMENTS) {
    try {
      await db.getDocument(databaseId, "legalDocuments", d.key);
    } catch (e) {
      if (e.code !== 404) throw e;
      await db.createDocument(databaseId, "legalDocuments", d.key, d);
      console.log("Rechtstext angelegt:", d.key);
    }
  }
  console.log("Fertig.");
}

// Nur direkt aufgerufen ausfuehren; seed-legal.mjs importiert DOCUMENTS.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
