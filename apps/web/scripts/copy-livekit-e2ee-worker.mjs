// livekit-client ships its E2EE Web Worker as a subpath export
// ("livekit-client/e2ee-worker") rather than a plain public asset — same
// class of problem as RNNoise's AudioWorklet script (see
// copy-rnnoise-assets.mjs): Next.js has no Vite-style `?worker` import, so
// the worker needs to be a real file under public/ with a stable URL new
// Worker() can load. Kept in sync via postinstall rather than a one-time
// manual copy that would silently go stale on the next dependency update.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolved via Node's own module resolution (the package's own subpath
// export), not a hardcoded relative path — pnpm's workspace layout
// (content-addressable store, per-package node_modules symlinks) isn't
// something to hardcode a guess about.
const workerEntry = fileURLToPath(import.meta.resolve("livekit-client/e2ee-worker"));
const targetDir = join(__dirname, "..", "public");
const targetFile = join(targetDir, "livekit-e2ee-worker.mjs");

async function main() {
  await mkdir(targetDir, { recursive: true });
  await copyFile(workerEntry, targetFile);
  console.log(`Copied LiveKit E2EE worker to ${targetFile}`);
}

main().catch((err) => {
  console.error("Failed to copy LiveKit E2EE worker:", err);
  process.exit(1);
});
