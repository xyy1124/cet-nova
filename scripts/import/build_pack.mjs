/**
 * 把 parse_paper.py 的输出 + 答案表 组装成 CET Nova 内容包。
 *
 * 用法：node scripts/import/build_pack.mjs <parsed.json> <answers.json> <out.json>
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [, , parsedPath, answersPath, outPath] = process.argv;
if (!parsedPath || !answersPath || !outPath) {
  console.error("usage: node build_pack.mjs <parsed.json> <answers.json> <out.json>");
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(parsedPath, "utf-8"));
const key = JSON.parse(readFileSync(answersPath, "utf-8"));

const SESSION = String(key.paper).replace(/[.\/]/g, "-");
const VARIANT = key.variant ?? "v1";
const PACK_ID = `cet6-${SESSION}-${VARIANT}`;
const NOW = "2026-11-12T00:00:00Z";
const LETTERS = ["A", "B", "C", "D"];
const ANSWER_SOURCE = key.sources?.[0]?.id ?? "source";
const SET_NO = Number(VARIANT.replace("v", "")) || 1;
const [SESS_YEAR, SESS_MONTH] = SESSION.split("-");
const TITLE_ZH = `${SESS_YEAR} 年 ${Number(SESS_MONTH)} 月 六级真题（第 ${SET_NO} 套）`;
const TITLE_EN = `CET-6 ${SESSION} set ${SET_NO}`;

const materials = [];
const questions = [];
const answers = [];
const records = [];

function pushChoice({ no, part, materialId, stem, options, letter, evidenceNote }) {
  const optionList = LETTERS.filter((l) => options[l]).map((l, i) => ({
    optionId: `o${i + 1}`,
    text: options[l],
  }));
  const index = LETTERS.indexOf(letter);
  const optionId = optionList[index]?.optionId;
  if (!optionId) throw new Error(`第 ${no} 题答案 ${letter} 不在选项内`);
  const questionId = `cet6.${SESSION}.${VARIANT}.q${no}`;
  questions.push({
    questionId,
    materialId,
    part,
    paperNo: no,
    type: "single_choice",
    stem: stem ?? "",
    options: optionList,
    evidence: [],
    evidenceStatus: "pending",
    skills: [],
    difficulty: 3,
    ...(evidenceNote ? { note: evidenceNote } : {}),
  });
  const recordId = `akr-${SESSION}-${VARIANT}-${String(no).padStart(3, "0")}`;
  records.push({
    recordId,
    variantId: VARIANT,
    paperNo: no,
    letter,
    sourceId: ANSWER_SOURCE,
  });
  answers.push({
    questionId,
    optionId,
    basis: "third_party_single",
    derivedFrom: [recordId],
    conflicts: [],
    review: { status: "verified", by: ["import-2024-12-14"], at: "2026-11-12" },
  });
  return questionId;
}

// ---------- 听力 ----------
const listeningParts = (no) =>
  no <= 8 ? "listening.p1" : no <= 15 ? "listening.p2" : "listening.p3";

materials.push({
  materialId: `mat-${SESSION}-L`,
  section: "listening",
  part: "listening.p1",
  sharedAcrossVariants: true,
  audio: { assetId: `aud-${SESSION}-v1`, durationMs: 0 },
});

for (const section of parsed.listening) {
  for (const q of section.questions) {
    pushChoice({
      no: q.no,
      part: listeningParts(q.no),
      materialId: `mat-${SESSION}-L`,
      stem: q.stem,
      options: q.options,
      letter: key.listening[String(q.no)],
    });
  }
}

// ---------- 选词填空 ----------
const cloze = parsed.reading.cloze;
materials.push({
  materialId: `mat-${SESSION}-R1`,
  section: "reading",
  part: "reading.p1",
  sharedAcrossVariants: true,
  passage: {
    title: "",
    wordCount: cloze.passage.split(/\s+/).filter(Boolean).length,
    paragraphs: [{ id: "P1", text: cloze.passage }],
  },
  wordBank: Object.keys(cloze.wordBank)
    .sort()
    .map((l) => cloze.wordBank[l]),
});

for (const q of cloze.questions) {
  const letter = key.cloze[String(q.no)];
  const word = cloze.wordBank[letter];
  if (!word) throw new Error(`第 ${q.no} 题答案字母 ${letter} 不在词库`);
  const questionId = `cet6.${SESSION}.${VARIANT}.q${q.no}`;
  questions.push({
    questionId,
    materialId: `mat-${SESSION}-R1`,
    part: "reading.p1",
    paperNo: q.no,
    type: "banked_cloze",
    blankIndex: q.blankIndex,
    stem: `选词填空第 ${q.no} 空`,
    options: [],
    evidence: [],
    evidenceStatus: "pending",
    skills: [],
    difficulty: 3,
  });
  const recordId = `akr-${SESSION}-${VARIANT}-${q.no}`;
  records.push({
    recordId,
    variantId: VARIANT,
    paperNo: q.no,
    mode: "word",
    value: word,
    sourceId: ANSWER_SOURCE,
  });
  answers.push({
    questionId,
    optionId: `word:${word}`,
    basis: "third_party_single",
    derivedFrom: [recordId],
    conflicts: [],
    review: { status: "verified", by: ["import-2024-12-14"], at: "2026-11-12" },
  });
}

// ---------- 长篇阅读 ----------
const matching = parsed.reading.matching;
materials.push({
  materialId: `mat-${SESSION}-R2`,
  section: "reading",
  part: "reading.p2",
  sharedAcrossVariants: true,
  passage: {
    title: matching.title,
    wordCount: matching.paragraphs.reduce(
      (sum, p) => sum + p.text.split(/\s+/).filter(Boolean).length,
      0,
    ),
    paragraphs: matching.paragraphs,
  },
});

for (const stmt of matching.statements) {
  const letter = key.matching[String(stmt.no)];
  const questionId = `cet6.${SESSION}.${VARIANT}.q${stmt.no}`;
  questions.push({
    questionId,
    materialId: `mat-${SESSION}-R2`,
    part: "reading.p2",
    paperNo: stmt.no,
    type: "paragraph_match",
    paragraphLetters: matching.paragraphs.map((p) => p.id),
    stem: stmt.text,
    options: [],
    evidence: [],
    evidenceStatus: "pending",
    skills: [],
    difficulty: 3,
  });
  const recordId = `akr-${SESSION}-${VARIANT}-${stmt.no}`;
  records.push({
    recordId,
    variantId: VARIANT,
    paperNo: stmt.no,
    mode: "paragraph",
    value: letter,
    sourceId: ANSWER_SOURCE,
  });
  answers.push({
    questionId,
    optionId: `para:${letter}`,
    basis: "third_party_single",
    derivedFrom: [recordId],
    conflicts: [],
    review: { status: "verified", by: ["import-2024-12-14"], at: "2026-11-12" },
  });
}

// ---------- 仔细阅读 ----------
parsed.reading.careful.forEach((passage, pIndex) => {
  const materialId = `mat-${SESSION}-R${3 + pIndex}`;
  materials.push({
    materialId,
    section: "reading",
    part: "reading.p3",
    sharedAcrossVariants: true,
    passage: {
      title: passage.label,
      wordCount: passage.text.split(/\s+/).filter(Boolean).length,
      paragraphs: [{ id: "P1", text: passage.text }],
    },
  });
  for (const q of passage.questions) {
    pushChoice({
      no: q.no,
      part: "reading.p3",
      materialId,
      stem: q.stem,
      options: q.options,
      letter: key.careful[String(q.no)],
    });
  }
});

// ---------- 翻译 ----------
materials.push({
  materialId: `mat-${SESSION}-T`,
  section: "translation",
  part: "translation",
  sharedAcrossVariants: true,
  passage: {
    title: "汉译英",
    wordCount: parsed.translation.text.length,
    paragraphs: [{ id: "P1", text: parsed.translation.text }],
  },
  referenceTranslation: {
    text: key.referenceTranslation ?? "",
    sourceId: ANSWER_SOURCE,
  },
});

questions.push({
  questionId: `cet6.${SESSION}.${VARIANT}.q56`,
  materialId: `mat-${SESSION}-T`,
  part: "translation",
  paperNo: 56,
  type: "free_text",
  stem: "将下面的中文段落译成英文。",
  options: [],
  evidence: [{ kind: "reference_translation", segmentIndex: 1, infoPoint: "北斗系统的研制意义" }],
  evidenceStatus: "verified",
  skills: [],
  difficulty: 3,
});

// ---------- 写作 ----------
const writingTask = {
  writingTaskId: `wt-${SESSION}-v1`,
  paperNo: null,
  prompt: parsed.writing.directions.replace(/^Directions:\s*/, ""),
  requirements: [
    "150–200 words",
    "以给定的句子开头",
    "不要照抄题目",
  ],
  referenceEssays: [],
};

// ---------- 套卷 ----------
const variant = {
  variantId: VARIANT,
  label: { zh: `第 ${VARIANT.slice(1)} 套` },
  questionSet: questions.map((q) => q.questionId),
  writingTaskId: writingTask.writingTaskId,
  translationQuestionId: `cet6.${SESSION}.${VARIANT}.q56`,
};

const pack = {
  schemaVersion: "1.0.0",
  packId: PACK_ID,
  examId: "cet6",
  sessionId: SESSION,
  kind: "exam",
  title: {
    zh: TITLE_ZH,
    en: TITLE_EN,
  },
  builtAt: NOW,
  builder: { tool: "cetnova-import", version: "0.1.0" },
  sources: [
    {
      sourceId: "src-0609x-paper-v1",
      kind: "paper_pdf",
      host: "github.com/0609x/CET46-Resources",
      path: "六级真题/2024.12/真题PDF/2024.12六级真题第1套.pdf",
      retrievedAt: NOW,
      note: "卷面文本由 PyMuPDF 抽取，未改动用词",
    },
    ...key.sources.map((s) => ({
      sourceId: s.id,
      kind: "answer_key",
      host: new URL(s.url).host,
      path: new URL(s.url).pathname,
      retrievedAt: NOW,
      note: `${s.title}（${s.covers}；匹配依据：${s.matchedBy[0]}）`,
    })),
  ],
  assets: [
    {
      assetId: `aud-${SESSION}-${VARIANT}`,
      type: "audio",
      mimeType: "audio/mpeg",
      durationMs: 0,
      distribution: {
        state: "external",
        url: key.audio?.url ?? "",
        referrer: "https://github.com/0609x/CET46-Resources",
        note: `${key.audio?.note ?? "外部音频"}；不随包分发，由用户从原始来源获取`,
      },
      integrity: { bytes: key.audio?.bytes ?? 0 },
      rights: { status: "third_party", note: "著作权归原权利人" },
    },
  ],
  materials,
  questions,
  answers,
  answerKeyRecords: records,
  variants: [variant],
  writingTasks: [writingTask],
  integrity: {},
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(pack, null, 2), "utf-8");
console.log(
  JSON.stringify({
    out: outPath,
    questions: questions.length,
    materials: materials.length,
    answers: answers.length,
    records: records.length,
  }),
);
