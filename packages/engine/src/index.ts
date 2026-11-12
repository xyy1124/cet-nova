import type {
  Pack,
  Question,
  SectionId,
  SkillId,
  Variant,
} from "@cetnova/schema";
import { letterFor } from "@cetnova/schema";

export interface UserResponse {
  optionId?: string;
  text?: string;
  revealCount?: number;
  totalMs?: number;
  flagged?: boolean;
}

export type ResponseMap = Record<string, UserResponse>;

export interface GradeItem {
  questionId: string;
  paperNo: number | null;
  part: string;
  section: SectionId;
  type: Question["type"];
  correct: boolean | null;
  userOptionId?: string;
  correctOptionId?: string;
  userLetter?: string;
  correctLetter?: string;
}

export interface Bucket {
  correct: number;
  total: number;
  percent: number;
}

export interface GradeResult {
  items: GradeItem[];
  objectiveCorrect: number;
  objectiveTotal: number;
  percent: number;
  bySection: Record<string, Bucket>;
  byPart: Record<string, Bucket>;
  bySkill: Record<string, Bucket>;
}

function emptyBucket(): Bucket {
  return { correct: 0, total: 0, percent: 0 };
}

function add(bucket: Bucket, correct: boolean) {
  bucket.total += 1;
  if (correct) bucket.correct += 1;
  bucket.percent = bucket.total === 0 ? 0 : bucket.correct / bucket.total;
}

export function findQuestion(
  pack: Pack,
  variant: Variant,
  questionId: string,
): Question | undefined {
  if (!variant.questionSet.includes(questionId)) return undefined;
  return pack.questions.find((q) => q.questionId === questionId);
}

export function answerOf(pack: Pack, questionId: string) {
  return pack.answers.find((a) => a.questionId === questionId);
}

export function correctOptionId(
  pack: Pack,
  questionId: string,
): string | undefined {
  return answerOf(pack, questionId)?.optionId;
}

export function correctLetter(
  pack: Pack,
  variant: Variant,
  questionId: string,
): string | null {
  const q = pack.questions.find((x) => x.questionId === questionId);
  const a = answerOf(pack, questionId);
  if (!q || !a) return null;
  return letterFor(variant, q, a.optionId);
}

export function userLetter(
  pack: Pack,
  variant: Variant,
  questionId: string,
  optionId?: string,
): string | undefined {
  if (!optionId || optionId.startsWith("para:") || optionId.startsWith("word:"))
    return undefined;
  const q = pack.questions.find((x) => x.questionId === questionId);
  if (!q) return undefined;
  return letterFor(variant, q, optionId) ?? undefined;
}

export function gradeAttempt(
  pack: Pack,
  variant: Variant,
  responses: ResponseMap,
): GradeResult {
  const items: GradeItem[] = [];
  const bySection: Record<string, Bucket> = {};
  const byPart: Record<string, Bucket> = {};
  const bySkill: Record<string, Bucket> = {};

  for (const questionId of variant.questionSet) {
    const q = pack.questions.find((x) => x.questionId === questionId);
    if (!q) continue;
    const answer = answerOf(pack, questionId);
    const user = responses[questionId];

    if (q.type === "free_text") {
      items.push({
        questionId,
        paperNo: q.paperNo,
        part: q.part,
        section: q.part.split(".")[0] as SectionId,
        type: q.type,
        correct: null,
      });
      continue;
    }

    const correct = !!user?.optionId && user.optionId === answer?.optionId;
    items.push({
      questionId,
      paperNo: q.paperNo,
      part: q.part,
      section: q.part.split(".")[0] as SectionId,
      type: q.type,
      correct,
      userOptionId: user?.optionId,
      correctOptionId: answer?.optionId,
      userLetter: userLetter(pack, variant, questionId, user?.optionId),
      correctLetter: correctLetter(pack, variant, questionId) ?? undefined,
    });

    const section = q.part.split(".")[0] as SectionId;
    bySection[section] ??= emptyBucket();
    add(bySection[section], correct);
    byPart[q.part] ??= emptyBucket();
    add(byPart[q.part], correct);
    for (const skill of q.skills as SkillId[]) {
      bySkill[skill] ??= emptyBucket();
      add(bySkill[skill], correct);
    }
  }

  const graded = items.filter((i) => i.correct !== null);
  const objectiveCorrect = graded.filter((i) => i.correct).length;

  return {
    items,
    objectiveCorrect,
    objectiveTotal: graded.length,
    percent: graded.length === 0 ? 0 : objectiveCorrect / graded.length,
    bySection,
    byPart,
    bySkill,
  };
}

/** 折合分值：仅作参考，界面必须标注非官方 */
export function estimateSectionScores(
  result: GradeResult,
  maxScores: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, bucket] of Object.entries(result.bySection)) {
    const max = maxScores[key];
    if (max) out[key] = Math.round(bucket.percent * max * 10) / 10;
  }
  return out;
}

export function percentText(value: number): string {
  return `${Math.round(value * 100)}%`;
}
