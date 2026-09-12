// @sapphi-red/web-noise-suppressor ships its AudioWorklet script and WASM
// binaries inside node_modules, but Next.js only serves files placed under
// public/ at a stable URL — there's no Vite-style `?url` import here. This
// copies exactly the files the noise-cancellation processor needs into
// public/rnnoise/, kept in sync automatically via postinstall (see
// package.json) rather than a one-time manual copy that would silently go
// stale on the next dependency update.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolved via Node's own module resolution rather than a hardcoded
// relative path — pnpm's workspace layout (content-addressable store,
// per-package node_modules symlinks) isn't something to hardcode a guess
// about.
// The package's main entry resolves to dist/index.js — its sibling files
// (rnnoise/workletProcessor.js, rnnoise.wasm, etc.) live in that same
// dist/ directory.
const packageEntry = fileURLToPath(import.meta.resolve("@sapphi-red/web-noise-suppressor"));
const packageDir = dirname(packageEntry);
const targetDir = join(__dirname, "..", "public", "rnnoise");

const FILES = [
  ["rnnoise/workletProcessor.js", "workletProcessor.js"],
  ["rnnoise.wasm", "rnnoise.wasm"],
  ["rnnoise_simd.wasm", "rnnoise_simd.wasm"],
];

async function main() {
  await mkdir(targetDir, { recursive: true });
  for (const [source, dest] of FILES) {
    await copyFile(join(packageDir, source), join(targetDir, dest));
  }
  console.log(`Copied RNNoise assets to ${targetDir}`);
}

main().catch((err) => {
  console.error("Failed to copy RNNoise assets:", err);
  process.exit(1);
});
