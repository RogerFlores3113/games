#!/usr/bin/env node
// SCENE-12 (RESEARCH.md Pitfall 3): post-`next build` guard.
//
// Two checks against the production static output (apps/web/.next/static):
//   1. The Playwright test-bridge marker `__expeditionTest` must never
//      appear in shipped production JS — a runtime `NODE_ENV` guard alone
//      is not sufficient proof (Pitfall 3); this greps the actual artifact.
//   2. Unless `--skip-phaser-presence` is passed, at least one file must
//      contain a Phaser build signature, proving Phaser itself did get
//      bundled somewhere (a sanity check that the confinement test isn't
//      accidentally hiding a "phaser never loads at all" regression).
//
// No dependencies; plain Node ESM so it can run via `node` directly in CI
// or a package.json script, matching the codebase's other check scripts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(SCRIPT_DIR, "..", ".next", "static");

const TEST_BRIDGE_MARKER = "__expeditionTest";

// Chosen from node_modules/phaser/src/core/Config.js:
//   this.gameURL = GetValue(config, 'url', 'https://phaser.io/' + CONST.LOG_VERSION);
// This is a runtime string literal (not a comment or doc annotation), so it
// survives minification/tree-shaking intact — Terser/SWC rewrite variable
// names and whitespace but never rewrite string literal contents. It is
// also distinctive enough not to appear in any non-Phaser bundle by chance.
const PHASER_SIGNATURE = "https://phaser.io/";

const skipPhaserPresence = process.argv.includes("--skip-phaser-presence");

function listFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function main() {
  let staticDirStat;
  try {
    staticDirStat = statSync(STATIC_DIR);
  } catch {
    console.error(
      `check-expedition-build: ${STATIC_DIR} does not exist — run \`npm run build:web\` first.`,
    );
    process.exit(1);
  }
  if (!staticDirStat.isDirectory()) {
    console.error(`check-expedition-build: ${STATIC_DIR} is not a directory.`);
    process.exit(1);
  }

  const files = listFiles(STATIC_DIR);
  const offendingFiles = [];
  let phaserSignatureFound = false;

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      // Binary or unreadable file (e.g. source maps in some setups, images);
      // skip rather than fail the whole check.
      continue;
    }
    if (content.includes(TEST_BRIDGE_MARKER)) {
      offendingFiles.push(file);
    }
    if (content.includes(PHASER_SIGNATURE)) {
      phaserSignatureFound = true;
    }
  }

  let failed = false;

  if (offendingFiles.length > 0) {
    console.error(
      `check-expedition-build: found "${TEST_BRIDGE_MARKER}" in ${offendingFiles.length} production file(s):`,
    );
    for (const file of offendingFiles) {
      console.error(`  - ${path.relative(STATIC_DIR, file)}`);
    }
    failed = true;
  }

  if (!skipPhaserPresence && !phaserSignatureFound) {
    console.error(
      `check-expedition-build: Phaser signature "${PHASER_SIGNATURE}" not found anywhere in ${STATIC_DIR} — expected at least one bundled chunk to contain it once Expedition's Phaser scenes exist. Pass --skip-phaser-presence before Phaser scenes are wired up.`,
    );
    failed = true;
  } else if (phaserSignatureFound) {
    console.log(`check-expedition-build: Phaser signature "${PHASER_SIGNATURE}" found (OK).`);
  } else {
    console.log("check-expedition-build: --skip-phaser-presence set, skipping Phaser presence check.");
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`check-expedition-build: OK — "${TEST_BRIDGE_MARKER}" absent from production output.`);
}

main();
