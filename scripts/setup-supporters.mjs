#!/usr/bin/env node
/**
 * WOMS Unterstuetzung – Appwrite-Setup (idempotent).
 * Legt in der Sammlung worksheets das Attribut "supporters" an (JSON-Liste der
 * unterstuetzenden Mitarbeiter, siehe src/lib/support.js).
 *
 * Usage:
 *   node scripts/setup-supporters.mjs --dry-run
 *   APPWRITE_API_KEY=... node scripts/setup-supporters.mjs
 */

import { pathToFileURL } from "node:url";

const dryRun = process.argv.includes("--dry-run");
const endpoint = process.env.APPWRITE_ENDPOINT || "https://appwrite.webklar.com/v1";
const projectId = process.env.APPWRITE_PROJECT_ID || "6a1058610003c5a13a05";
const databaseId = process.env.APPWRITE_DATABASE_ID || "woms-database";
const apiKey = process.env.APPWRITE_API_KEY;
const collectionId = "worksheets";

export const ATTRIBUTE = { key: "supporters", type: "string", size: 4000, required: false };

/** 'create' = fehlt, 'exists' = passt, 'conflict' = gleicher Name mit anderem Typ oder zu klein */
export function planAttribute(existing) {
  const found = (existing || []).find((a) => a.key === ATTRIBUTE.key);
  if (!found) return "create";
  if (found.type !== ATTRIBUTE.type || !(Number(found.size) >= ATTRIBUTE.size)) return "conflict";
  return "exists";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (dryRun) {
    console.log(`Sammlung ${collectionId}: Attribut ${ATTRIBUTE.key} (String ${ATTRIBUTE.size}, nicht Pflicht) wird angelegt, falls es fehlt.`);
    return;
  }
  if (!apiKey) {
    console.error("APPWRITE_API_KEY required (oder --dry-run)");
    process.exit(1);
  }
  const { Client, Databases } = await import("node-appwrite");
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const db = new Databases(client);

  const { attributes } = await db.listAttributes(databaseId, collectionId);
  const plan = planAttribute(attributes);
  if (plan === "conflict") {
    console.error(`Attribut ${ATTRIBUTE.key} existiert schon mit anderem Typ oder kleinerer Größe – bitte in der Appwrite-Konsole prüfen.`);
    process.exit(1);
  }
  if (plan === "exists") {
    console.log(`Attribut ${ATTRIBUTE.key} ist schon vorhanden.`);
    return;
  }
  await db.createStringAttribute(databaseId, collectionId, ATTRIBUTE.key, ATTRIBUTE.size, ATTRIBUTE.required);
  console.log(`Attribut ${ATTRIBUTE.key} angelegt, warte auf Appwrite …`);
  const until = Date.now() + 30000;
  for (;;) {
    const attr = await db.getAttribute(databaseId, collectionId, ATTRIBUTE.key);
    if (attr.status === "available") break;
    if (attr.status === "failed" || attr.status === "stuck") throw new Error(`Attribut fehlgeschlagen: ${attr.error || attr.status}`);
    if (Date.now() > until) throw new Error("Attribut nach 30 s nicht verfügbar – Status in der Appwrite-Konsole prüfen.");
    await sleep(1000);
  }
  console.log(`Attribut ${ATTRIBUTE.key}: available`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
