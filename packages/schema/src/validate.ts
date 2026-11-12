import type {
  Answer,
  ExamConfig,
  Pack,
  Question,
  Variant,
} from "./types.ts";

export type Severity = "error" | "warning";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: {
    questions: number;
    objective: number;
    answers: number;
    variants: number;
    materials: number;
    audioAssets: number;
  };
}

/** 规范化文本后取 32 位 FNV-1a 哈希，用于跨卷比较"正确选项语义" */
export function semanticKeyOf(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[.,;:!?'"“”‘’()\[\]—-]/g, "")
    .trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function optionOrderFor(
  variant: Variant,
  question: Question,
): string[] {
  const override = variant.optionOrders?.[question.questionId];
  if (override && override.length > 0) return override;
  return question.options.map((o) => o.optionId);
}

/** optionId → 该套卷渲染出来的字母 */
export function letterFor(
  variant: Variant,
  question: Question,
  optionId: string,
): string | null {
  const order = optionOrderFor(variant, question);
  const index = order.indexOf(optionId);
  return index < 0 ? null : LETTERS[index];
}

/** 该套卷渲染出来的字母 → optionId */
export function optionIdFor(
  variant: Variant,
  question: Question,
  letter: string,
): string | null {
  const order = optionOrderFor(variant, question);
  const index = LETTERS.indexOf(letter.toUpperCase());
  if (index < 0 || index >= order.length) return null;
  return order[index];
}

export function validatePack(
  pack: Pack,
  exam: ExamConfig,
): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const err = (code: string, message: string, path?: string) =>
    errors.push({ code, severity: "error", message, path });
  const warn = (code: string, message: string, path?: string) =>
    warnings.push({ code, severity: "warning", message, path });

  const isExam = pack.kind === "exam";
  const hasListening = pack.hasListening !== false;
  const qById = new Map<string, Question>();
  const aByQ = new Map<string, Answer>();
  const mById = new Map(pack.materials.map((m) => [m.materialId, m]));
  const vById = new Map(pack.variants.map((v) => [v.variantId, v]));
  const partById = new Map(exam.parts.map((p) => [p.id, p]));

  // ---------- 结构：ID 唯一 ----------
  for (const q of pack.questions) {
    if (qById.has(q.questionId))
      err("V00", `题目 ID 重复：${q.questionId}`, q.questionId);
    qById.set(q.questionId, q);
  }
  for (const a of pack.answers) {
    if (aByQ.has(a.questionId))
      err("V00", `答案重复：${a.questionId}`, a.questionId);
    aByQ.set(a.questionId, a);
  }
  if (pack.variants.length === 0) err("V00", "至少需要一个套卷");

  const objective = pack.questions.filter((q) => q.type !== "free_text");

  // ---------- V01 paperNo ----------
  const paperNos = new Set<number>();
  for (const q of pack.questions) {
    if (q.paperNo === null) continue;
    if (paperNos.has(q.paperNo) && isExam)
      err("V01", `paperNo 重复：${q.paperNo}`, q.questionId);
    paperNos.add(q.paperNo);
    const part = partById.get(q.part);
    if (!part) {
      err("V01", `未知 part：${q.part}`, q.questionId);
      continue;
    }
    const [lo, hi] = part.paperNos;
    if (q.paperNo < lo || q.paperNo > hi)
      err(
        "V01",
        `paperNo ${q.paperNo} 不在 ${q.part} 的区间 ${lo}–${hi}`,
        q.questionId,
      );
  }

  // ---------- V02 题量 ----------
  for (const part of exam.parts) {
    if (!hasListening && part.section === "listening") continue;
    const count = pack.questions.filter((q) => q.part === part.id).length;
    if (isExam && count !== part.count)
      err("V02", `${part.id} 题量 ${count}，应为 ${part.count}`);
    if (!isExam && count > part.count)
      err("V02", `${part.id} 题量 ${count} 超过上限 ${part.count}`);
    if (!isExam && count < part.count)
      warn("V02", `${part.id} 为演示精简题量 ${count}/${part.count}`);
  }

  // ---------- V03 选项结构 ----------
  for (const q of pack.questions) {
    if (q.type === "single_choice") {
      if (q.options.length !== 4)
        err("V03", `单选题应有 4 个选项，实为 ${q.options.length}`, q.questionId);
    }
    if (q.type === "banked_cloze") {
      const m = mById.get(q.materialId);
      const bank = m?.wordBank ?? [];
      const need = isExam ? 15 : 5;
      if (bank.length < need)
        err("V03", `选词填空词库 ${bank.length} 词，至少 ${need}`, q.questionId);
    }
    if (q.type === "free_text" && q.options.length > 0)
      warn("V03", "主观题不应有选项", q.questionId);
    if (q.type === "paragraph_match" && !q.paragraphLetters?.length) {
      const letters = mById.get(q.materialId)?.passage?.paragraphs.map((p) => p.id);
      if (!letters?.length)
        err("V03", "匹配题材料缺少段落字母", q.questionId);
    }
  }

  // ---------- V04 选项文本去重 ----------
  for (const q of pack.questions) {
    const seen = new Set<string>();
    for (const o of q.options) {
      const key = o.text.trim().toLowerCase();
      if (seen.has(key))
        err("V04", `选项文本重复：${o.text.slice(0, 40)}`, q.questionId);
      seen.add(key);
      if (o.semanticKey && o.semanticKey !== semanticKeyOf(o.text))
        warn("V04", `选项语义哈希与文本不符：${o.optionId}`, q.questionId);
    }
  }

  // ---------- V05 / V09 / V10 / V11 / V12 / V13 ----------
  for (const q of objective) {
    const answer = aByQ.get(q.questionId);
    if (!answer) {
      err("V05", "缺少答案", q.questionId);
      continue;
    }
    const okPrefix =
      answer.optionId.startsWith("para:") || answer.optionId.startsWith("word:");
    if (!okPrefix && !q.options.some((o) => o.optionId === answer.optionId))
      err("V05", `答案 ${answer.optionId} 不在选项中`, q.questionId);

    if (answer.optionId.startsWith("para:")) {
      const letter = answer.optionId.slice(5);
      const paragraphs = mById.get(q.materialId)?.passage?.paragraphs ?? [];
      if (!paragraphs.some((p) => p.id === letter))
        err("V12", `匹配答案段落 ${letter} 不存在`, q.questionId);
      if (q.paragraphLetters && !q.paragraphLetters.includes(letter))
        warn("V12", `答案段落 ${letter} 不在题目允许范围`, q.questionId);
    }

    if (answer.optionId.startsWith("word:")) {
      const word = answer.optionId.slice(5);
      const bank = mById.get(q.materialId)?.wordBank ?? [];
      if (!bank.includes(word))
        err("V13", `答案词 ${word} 不在词库中`, q.questionId);
    }

    if (!q.evidence || q.evidence.length === 0) {
      if (q.evidenceStatus === "pending")
        warn("W21", "答案依据待人工标注（已允许入库）", q.questionId);
      else err("V09", "缺少答案依据 evidence", q.questionId);
    }

    for (const ev of q.evidence ?? []) {
      if (ev.kind === "audio_span") {
        const duration = mById.get(q.materialId)?.audio?.durationMs ?? 0;
        const end = ev.endMs ?? 0;
        if (!ev.fromSentenceId && ev.startMs === undefined)
          warn("V10", "audio_span 缺少时间或句 ID", q.questionId);
        if (duration > 0 && end > duration + 1000)
          err("V10", `答案区间 ${end}ms 超出音频 ${duration}ms`, q.questionId);
      }
      if (ev.kind === "text_span" || ev.kind === "paragraph_ref") {
        const paragraphs = mById.get(q.materialId)?.passage?.paragraphs ?? [];
        if (paragraphs.length > 0 && !paragraphs.some((p) => p.id === ev.paragraphId))
          err("V11", `evidence 段落 ${ev.paragraphId} 不存在`, q.questionId);
      }
    }
  }

  // ---------- V06 答案溯源 ----------
  for (const v of pack.variants) {
    for (const record of pack.answerKeyRecords.filter(
      (r) => r.variantId === v.variantId,
    )) {
      if (record.mode && record.mode !== "letter") continue;
      if (!record.letter) {
        err("A1", `答案记录 ${record.recordId} 缺少字母`, record.recordId);
        continue;
      }
      const q = [...v.questionSet]
        .map((id) => qById.get(id))
        .find((x) => x && x.paperNo === record.paperNo);
      if (!q) {
        err(
          "A1",
          `答案记录 ${record.recordId} 找不到对应题目（paperNo ${record.paperNo}）`,
          v.variantId,
        );
        continue;
      }
      const resolved = optionIdFor(v, q, record.letter);
      if (!resolved) {
        err(
          "A1",
          `答案字母 ${record.letter} 超出选项范围`,
          record.recordId,
        );
        continue;
      }
      const answer = aByQ.get(q.questionId);
      if (!answer) continue;
      if (resolved !== answer.optionId)
        err(
          "A1",
          `答案反解不一致：${record.recordId} 得 ${resolved}，应为 ${answer.optionId}`,
          q.questionId,
        );
    }
  }

  for (const answer of pack.answers) {
    const q = qById.get(answer.questionId);
    if (!q) {
      err("A3", `答案指向不存在的题目 ${answer.questionId}`);
      continue;
    }
    if (answer.derivedFrom.length === 0)
      err("A3", "答案缺少 derivedFrom 溯源记录", q.questionId);
    for (const id of answer.derivedFrom) {
      if (!pack.answerKeyRecords.some((r) => r.recordId === id))
        err("A3", `derivedFrom 指向不存在的记录 ${id}`, q.questionId);
    }
    if (!answer.conflicts) answer.conflicts = [];
  }

  // ---------- A2 跨卷答案语义一致 ----------
  const byPaperNo = new Map<number, Question[]>();
  for (const q of objective) {
    if (q.paperNo === null) continue;
    const list = byPaperNo.get(q.paperNo) ?? [];
    list.push(q);
    byPaperNo.set(q.paperNo, list);
  }
  for (const [paperNo, list] of byPaperNo) {
    if (list.length < 2) continue;
    const keys = new Map<string, string>();
    for (const q of list) {
      if (q.allowVariantDiff) continue;
      const a = aByQ.get(q.questionId);
      if (!a) continue;
      const option = q.options.find((o) => o.optionId === a.optionId);
      const key = option ? semanticKeyOf(option.text) : a.semanticKey;
      if (!key) continue;
      keys.set(q.questionId, key);
    }
    if (new Set(keys.values()).size > 1)
      err(
        "A2",
        `第 ${paperNo} 题在不同套卷中的正确答案语义不一致（${[...keys.values()].join(" vs ")}）`,
      );
  }

  // ---------- V07 答案依据等级 ----------
  for (const q of objective) {
    const a = aByQ.get(q.questionId);
    if (!a) continue;
    const publishable =
      a.basis === "official" || a.basis === "third_party_consensus";
    if (!publishable && a.review.status !== "verified")
      err("V07", `答案依据 ${a.basis} 且未经人工复核`, q.questionId);
    if (a.conflicts.length > 0 && a.review.status !== "verified")
      err("V07", "答案存在分歧但未复核", q.questionId);
  }

  // ---------- V08 未完成题目不得发布 ----------
  for (const q of pack.questions) {
    const a = aByQ.get(q.questionId);
    if (a && a.review.status !== "verified")
      err("V08", `题目状态为 ${a.review.status}，不得发布`, q.questionId);
    if (q.tagReview?.status === "ai_draft")
      warn("V17", "能力标签为 AI 草稿，未复核", q.questionId);
  }

  // ---------- V14 题号连续性 ----------
  if (isExam) {
    const nums = [...paperNos].sort((a, b) => a - b);
    const expected = hasListening
      ? Array.from({ length: 56 }, (_, i) => i + 1)
      : Array.from({ length: 31 }, (_, i) => i + 26);
    const missing = expected.filter((n) => !nums.includes(n));
    if (missing.length > 0) {
      const all = pack.questions.some((q) => q.paperNo === null);
      if (!(all && missing.length === 1 && missing[0] === 1))
        err("V14", `题号不连续，缺：${missing.join(", ")}`);
    }
  }

  // ---------- V15 资产权利 ----------
  for (const asset of pack.assets) {
    if (
      asset.distribution.state === "bundled" &&
      !["licensed", "public_domain"].includes(asset.rights?.status ?? "")
    )
      err("V15", `打包资产 ${asset.assetId} 未声明授权`, asset.assetId);
    if (asset.distribution.state === "external" && !asset.distribution.url)
      err("V15", `外部资产 ${asset.assetId} 缺少来源 URL`, asset.assetId);
  }

  // ---------- V16 原文质量 ----------
  for (const m of pack.materials) {
    if (m.audio && m.transcript && m.transcript.quality !== "verified")
      warn("V16", `听力原文未校对：${m.materialId}`, m.materialId);
  }

  // ---------- V18 重复题干 ----------
  const stems = new Map<string, string>();
  for (const q of pack.questions) {
    const key = `${q.stem.trim().toLowerCase()}|${q.options
      .map((o) => o.text)
      .join("|")
      .toLowerCase()}`;
    if (stems.has(key))
      warn("V18", `疑似重复题：${stems.get(key)} 与 ${q.questionId}`);
    stems.set(key, q.questionId);
  }

  // ---------- V19 篇幅 ----------
  for (const m of pack.materials) {
    if (m.passage && m.passage.wordCount === 0)
      warn("V19", `文章词数为 0：${m.materialId}`, m.materialId);
  }

  // ---------- 套卷完整性 ----------
  for (const v of pack.variants) {
    if (v.questionSet.length === 0) err("V00", `套卷 ${v.variantId} 为空`);
    for (const id of v.questionSet) {
      if (!qById.has(id))
        err("V00", `套卷 ${v.variantId} 引用了不存在的题目 ${id}`);
    }
    if (v.optionOrders) {
      for (const [qid, order] of Object.entries(v.optionOrders)) {
        const q = qById.get(qid);
        if (!q) {
          err("V00", `${v.variantId} 的 optionOrders 指向不存在的题 ${qid}`);
          continue;
        }
        if (order.length !== q.options.length)
          err("V00", `${v.variantId} 的 ${qid} 选项顺序长度不符`);
        if (new Set(order).size !== order.length)
          err("V00", `${v.variantId} 的 ${qid} 选项顺序有重复`);
        for (const oid of order)
          if (!q.options.some((o) => o.optionId === oid))
            err("V00", `${v.variantId} 的 ${qid} 选项顺序含未知 ${oid}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      questions: pack.questions.length,
      objective: objective.length,
      answers: pack.answers.length,
      variants: pack.variants.length,
      materials: pack.materials.length,
      audioAssets: pack.assets.filter((a) => a.type === "audio").length,
    },
  };
}
