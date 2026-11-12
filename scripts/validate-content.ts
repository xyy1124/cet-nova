import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePack } from "../packages/schema/src/index.ts";
import type { ExamConfig, Manifest, Pack } from "../packages/schema/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");

const RED = "\u001b[31m";
const YEL = "\u001b[33m";
const GRN = "\u001b[32m";
const DIM = "\u001b[2m";
const RST = "\u001b[0m";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const manifest = readJson<Manifest>(join(contentDir, "manifest.json"));
let failed = 0;

for (const entry of manifest.packs) {
  const packPath = join(contentDir, entry.path);
  if (!existsSync(packPath)) {
    console.error(`${RED}✗${RST} ${entry.packId}: 找不到 ${entry.path}`);
    failed++;
    continue;
  }
  const pack = readJson<Pack>(packPath);
  const examPath = join(contentDir, "exams", `${pack.examId}.json`);
  if (!existsSync(examPath)) {
    console.error(`${RED}✗${RST} ${entry.packId}: 找不到考试配置 ${pack.examId}.json`);
    failed++;
    continue;
  }
  const exam = readJson<ExamConfig>(examPath);
  const result = validatePack(pack, exam);

  const label = `${entry.packId} (${entry.kind})`;
  console.log(
    `\n${result.ok ? GRN + "✓" : RED + "✗"}${RST} ${label}  ` +
      `${DIM}${result.stats.questions} 题 / ${result.stats.objective} 客观 / ` +
      `${result.stats.answers} 答案 / ${result.stats.variants} 套卷 / ${result.stats.materials} 材料${RST}`,
  );

  for (const issue of result.errors) {
    console.log(`  ${RED}[${issue.code}]${RST} ${issue.message}${issue.path ? `  ${DIM}${issue.path}${RST}` : ""}`);
  }
  const grouped = new Map<string, typeof result.warnings>();
  for (const issue of result.warnings) {
    const list = grouped.get(issue.code) ?? [];
    list.push(issue);
    grouped.set(issue.code, list);
  }
  for (const [code, list] of grouped) {
    const sample = list.slice(0, 2).map((i) => i.message).join("；");
    const more = list.length > 2 ? " …" : "";
    console.log(`  ${YEL}[${code}]${RST} ×${list.length} ${sample}${more}`);
  }

  if (!result.ok) failed++;
}

console.log("");
if (failed > 0) {
  console.error(`${RED}校验失败：${failed} 个内容包有问题${RST}`);
  process.exit(1);
}
console.log(`${GRN}全部内容包通过校验${RST}`);
