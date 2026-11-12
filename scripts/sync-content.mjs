import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "content");
const dst = join(root, "apps", "web", "public", "content");

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const a = join(from, entry.name);
    const b = join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else if (entry.isFile()) copyFileSync(a, b);
  }
}

rmSync(dst, { recursive: true, force: true });
copyDir(src, dst);
console.log("[sync-content] content -> apps/web/public/content");
