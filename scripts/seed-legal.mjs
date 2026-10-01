#!/usr/bin/env node
/**
 * WOMS Rechtliches – Erstbefuellung (idempotent ueber das Feld `source`).
 * Liest scripts/legal-seed.json, erzeugt je Version eine Archivkopie als HTML
 * (Portal-HTML direkt aus Git, Website-Seiten per React zu HTML gerendert),
 * laedt sie in den Bucket legal-files und legt die Versionen an. Dazu die
 * Anbieter-Vertraege ohne Fristen und Preise.
 *
 * Usage:
 *   node scripts/seed-legal.mjs --dry-run [--out DIR]   (nur rendern, nichts hochladen)
 *   APPWRITE_API_KEY=... node scripts/seed-legal.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = "/home/webklar/apps";
const REPOS = {
  "webklar.com": process.env.WEBSITE_REPO || `${APPS}/webklar.com/build`,
  kundenbereich: process.env.PORTAL_REPO || `${APPS}/kundenbereich.webklar.com/build`,
};
const NODE_MODULES = process.env.WOMS_NODE_MODULES || `${APPS}/ticket.webklar.com/build/node_modules`;

const dryRun = process.argv.includes("--dry-run");
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx > 0 ? process.argv[outIdx + 1] : null;
const endpoint = process.env.APPWRITE_ENDPOINT || "https://appwrite.webklar.com/v1";
const projectId = process.env.APPWRITE_PROJECT_ID || "6a1058610003c5a13a05";
const databaseId = process.env.APPWRITE_DATABASE_ID || "woms-database";
const apiKey = process.env.APPWRITE_API_KEY;

export const PROVIDERS = [
  { provider: "Hetzner", purpose: "Server (Hosting aller Websites und Systeme)" },
  { provider: "Hetzner", purpose: "E-Mail-Postfächer" },
  { provider: "Porkbun", purpose: "Domains" },
  { provider: "Stripe", purpose: "Zahlungen der Abos" },
];

const require = createRequire(path.join(NODE_MODULES, "noop.js"));

function gitShow(repo, hash, file) {
  return execFileSync("git", ["-C", REPOS[repo], "show", `${hash}:${file}`], { maxBuffer: 20 * 1024 * 1024 });
}

// Alles ausser React wird zu einem Platzhalter: Komponenten geben nur ihre Kinder aus,
// Link wird zu <a>, Icons verschwinden. Die Exportnamen kommen aus den Imports der Seite.
function stubFor(source, specifier) {
  const names = new Set();
  let hasDefault = false;
  const re = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(re)) {
    if (m[3] !== specifier) continue;
    if (m[1]) hasDefault = true;
    for (const n of (m[2] || "").split(",")) {
      const name = n.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "");
      if (name) names.add(name);
    }
  }
  const lines = [
    "import React from 'react';",
    "const Pass = (p) => (p && p.children !== undefined ? React.createElement(React.Fragment, null, p.children) : null);",
  ];
  for (const n of names) {
    lines.push(n === "Link" || n === "NavLink"
      ? `export const ${n} = (p) => React.createElement('a', { href: p.to || p.href }, p.children);`
      : /^[A-Z]/.test(n) ? `export const ${n} = Pass;` : `export const ${n} = () => undefined;`);
  }
  if (hasDefault) lines.push("export default Pass;");
  return lines.join("\n");
}

async function renderTsx(source) {
  const esbuild = require("esbuild");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "legal-"));
  const entry = path.join(tmp, "page.tsx");
  fs.writeFileSync(entry, source);
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    nodePaths: [NODE_MODULES],
    external: ["react", "react-dom", "react/jsx-runtime"],
    logLevel: "silent",
    plugins: [{
      name: "stub",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          a.kind === "entry-point" || /^react(\/jsx-runtime)?$/.test(a.path) ? undefined : { path: a.path, namespace: "stub" });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubFor(source, a.path), loader: "js", resolveDir: NODE_MODULES }));
      },
    }],
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  const mod = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(mod, mod.exports, require);
  const Page = mod.exports.default;
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = renderToStaticMarkup(React.createElement(Page));
  const main = /<main[\s\S]*<\/main>/.exec(html);
  return main ? main[0] : html;
}

function wrap(title, entry, body) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} ${entry.version} – Archivkopie</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:820px;margin:0 auto;padding:24px;color:#111}
.archiv{background:#f3f4f6;border:1px solid #d1d5db;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:24px}
svg{display:none}h1{font-size:28px}</style></head>
<body><div class="archiv">Archivkopie aus WOMS · ${title} ${entry.version} · gültig ab ${entry.validFrom} · Quelle ${entry.source}</div>
${body}
</body></html>`;
}

export async function buildFile(entry, title) {
  const [repo, rest] = entry.source.split("@");
  const [hash, file] = rest.split(":");
  const raw = gitShow(repo, hash, file);
  const name = `${entry.documentKey}-${entry.version}-${hash}.html`;
  if (file.endsWith(".html")) return { name, content: raw };
  const body = await renderTsx(raw.toString("utf8"));
  return { name, content: Buffer.from(wrap(title, entry, body), "utf8") };
}

async function run() {
  const { versions } = JSON.parse(fs.readFileSync(path.join(HERE, "legal-seed.json"), "utf8"));
  const { DOCUMENTS } = await import("./setup-legal.mjs");
  const titles = Object.fromEntries(DOCUMENTS.map((d) => [d.key, d.title]));

  if (dryRun) {
    if (outDir) fs.mkdirSync(outDir, { recursive: true });
    for (const v of versions) {
      const f = await buildFile(v, titles[v.documentKey]);
      if (outDir) fs.writeFileSync(path.join(outDir, f.name), f.content);
      console.log(`${v.documentKey} ${v.version} ${v.status} ab ${v.validFrom}: ${f.name} (${f.content.length} Bytes)`);
    }
    for (const p of PROVIDERS) console.log(`Anbieter: ${p.provider} – ${p.purpose}`);
    return;
  }
  if (!apiKey) {
    console.error("APPWRITE_API_KEY required (oder --dry-run)");
    process.exit(1);
  }
  const { Client, Databases, Storage, ID, Query } = await import("node-appwrite");
  const { InputFile } = await import("node-appwrite/file");
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const db = new Databases(client);
  const storage = new Storage(client);

  let created = 0;
  for (const v of versions) {
    const found = await db.listDocuments(databaseId, "legalVersions", [Query.equal("source", v.source), Query.equal("documentKey", v.documentKey), Query.limit(1)]);
    if (found.total > 0) {
      console.log("vorhanden:", v.documentKey, v.version);
      continue;
    }
    const f = await buildFile(v, titles[v.documentKey]);
    const file = await storage.createFile("legal-files", ID.unique(), InputFile.fromBuffer(f.content, f.name));
    const doc = { ...v, validTo: null, fileIds: [file.$id] };
    await db.createDocument(databaseId, "legalVersions", ID.unique(), doc);
    created++;
    console.log("angelegt:", v.documentKey, v.version);
  }

  // validTo der abgeloesten Versionen: Tag vor der naechsten nicht-Entwurf-Version, nie vor dem eigenen Beginn
  const all = (await db.listDocuments(databaseId, "legalVersions", [Query.limit(5000)])).documents;
  for (const v of all.filter((x) => x.status === "superseded" && !x.validTo)) {
    const next = all
      .filter((x) => x.documentKey === v.documentKey && x.status !== "draft" && x.$id !== v.$id &&
        (x.validFrom > v.validFrom || (x.validFrom === v.validFrom && x.version > v.version)))
      .sort((a, b) => (a.validFrom + a.version).localeCompare(b.validFrom + b.version))[0];
    if (!next) continue;
    const d = new Date(`${next.validFrom}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const before = d.toISOString().slice(0, 10);
    await db.updateDocument(databaseId, "legalVersions", v.$id, { validTo: before < v.validFrom ? v.validFrom : before });
  }

  const existing = (await db.listDocuments(databaseId, "providerContracts", [Query.limit(5000)])).documents;
  for (const p of PROVIDERS) {
    if (existing.some((c) => c.provider === p.provider && c.purpose === p.purpose)) continue;
    await db.createDocument(databaseId, "providerContracts", ID.unique(), { ...p, fileIds: [] });
    console.log("Anbieter angelegt:", p.provider, p.purpose);
  }
  console.log(`Fertig: ${created} Versionen angelegt.`);
}

run().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
