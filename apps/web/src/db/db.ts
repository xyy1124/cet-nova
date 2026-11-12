import Dexie, { type Table } from "dexie";
import type { ResponseMap } from "@cetnova/engine";

export interface AttemptRow {
  attemptId: string;
  packId: string;
  packPath: string;
  examId: string;
  variantId: string;
  mode: "full" | "exam" | "section" | "review";
  startedAt: number;
  submittedAt?: number;
  activeMs: number;
  submitted: boolean;
  percent?: number;
  objectiveCorrect?: number;
  objectiveTotal?: number;
  questionIds?: string[];
}

export interface ResponseRow {
  id: string;
  attemptId: string;
  questionId: string;
  optionId?: string;
  text?: string;
  totalMs?: number;
  flagged: boolean;
  updatedAt: number;
}

export interface ReviewRow {
  questionId: string;
  packId: string;
  wrongCount: number;
  lastWrongAt: number;
  mastered: boolean;
}

export interface VocabRow {
  lemma: string;
  context?: string;
  questionId?: string;
  addedAt: number;
  mastered: boolean;
}

class NovaDB extends Dexie {
  attempts!: Table<AttemptRow, string>;
  responses!: Table<ResponseRow, string>;
  reviewItems!: Table<ReviewRow, string>;
  vocab!: Table<VocabRow, string>;

  constructor() {
    super("cetnova");
    this.version(1).stores({
      attempts: "attemptId, startedAt, packId, submitted",
      responses: "id, attemptId, questionId",
      reviewItems: "questionId, lastWrongAt, mastered",
      vocab: "lemma, addedAt, mastered",
    });
  }
}

export const db = new NovaDB();

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveResponse(
  attemptId: string,
  questionId: string,
  patch: Partial<ResponseRow>,
): Promise<void> {
  const id = `${attemptId}::${questionId}`;
  const existing = await db.responses.get(id);
  await db.responses.put({
    id,
    attemptId,
    questionId,
    optionId: patch.optionId ?? existing?.optionId,
    text: patch.text ?? existing?.text,
    totalMs: patch.totalMs ?? existing?.totalMs,
    flagged: patch.flagged ?? existing?.flagged ?? false,
    updatedAt: Date.now(),
  });
}

export async function loadResponses(attemptId: string): Promise<ResponseMap> {
  const rows = await db.responses.where("attemptId").equals(attemptId).toArray();
  const map: ResponseMap = {};
  for (const row of rows) {
    map[row.questionId] = {
      optionId: row.optionId,
      text: row.text,
      totalMs: row.totalMs,
      flagged: row.flagged,
    };
  }
  return map;
}

export async function createAttempt(input: {
  packId: string;
  packPath: string;
  examId: string;
  variantId: string;
  mode: AttemptRow["mode"];
  questionIds?: string[];
}): Promise<AttemptRow> {
  const row: AttemptRow = {
    attemptId: newId("att"),
    ...input,
    startedAt: Date.now(),
    activeMs: 0,
    submitted: false,
  };
  await db.attempts.put(row);
  return row;
}

export async function applyReviewResults(
  packId: string,
  items: Array<{ questionId: string; correct: boolean | null }>,
): Promise<void> {
  for (const item of items) {
    if (item.correct === null) continue;
    const existing = await db.reviewItems.get(item.questionId);
    if (item.correct) {
      if (existing && existing.wrongCount > 0) {
        await db.reviewItems.put({ ...existing, lastWrongAt: Date.now() });
      }
      continue;
    }
    await db.reviewItems.put({
      questionId: item.questionId,
      packId,
      wrongCount: (existing?.wrongCount ?? 0) + 1,
      lastWrongAt: Date.now(),
      mastered: false,
    });
  }
}
