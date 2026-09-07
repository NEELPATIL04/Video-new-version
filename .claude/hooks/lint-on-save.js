#!/usr/bin/env node
/**
 * PostToolUse hook: runs eslint --fix + prettier --write on the file that was
 * just edited/written, but only if those tools are actually installed.
 * Safe no-op before the repo is scaffolded (no node_modules yet).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return;
  }

  const filePath =
    event?.tool_input?.file_path || event?.tool_response?.filePath || "";

  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;
  if (!fs.existsSync(filePath)) return;

  const binDir = path.join(process.cwd(), "node_modules", ".bin");
  const resolve = (name) => {
    const candidates = [name, `${name}.cmd`];
    for (const c of candidates) {
      const p = path.join(binDir, c);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };

  const eslint = resolve("eslint");
  const prettier = resolve("prettier");

  if (eslint) {
    try {
      execFileSync(eslint, ["--fix", filePath], { stdio: "ignore" });
    } catch {
      // eslint exits non-zero on lint errors it can't autofix — that's fine,
      // this hook only auto-fixes what it can, it doesn't block the edit.
    }
  }

  if (prettier) {
    try {
      execFileSync(prettier, ["--write", filePath], { stdio: "ignore" });
    } catch {
      // formatting failure shouldn't block the edit either
    }
  }
});
