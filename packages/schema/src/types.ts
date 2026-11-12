/**
 * CET Nova 内容层类型定义
 * 对应规范：01-题库数据结构规范-v0.1.md
 */

export type SectionId = "writing" | "listening" | "reading" | "translation";

export type QuestionType =
  | "single_choice"
  | "banked_cloze"
  | "paragraph_match"
  | "free_text";

export type SkillId =
  | "fact_detail"
  | "main_idea"
  | "inference"
  | "vocabulary_in_context"
  | "attitude_tone"
  | "purpose"
  | "structure"
  | "listening_detail"
  | "listening_gist";

export type TrapId =
  | "literal_echo"
  | "partial_match"
  | "over_generalization"
  | "polarity_reversal"
  | "out_of_scope"
  | "wrong_attribution"
  | "similar_sound"
  | "time_shift"
  | "distractor_from_other";

export type AnswerBasis =
  | "official"
  | "third_party_consensus"
  | "third_party_single"
  | "synthetic_authored"
  | "model_inferred"
  | "unknown";

export type ReviewStatus = "verified" | "draft" | "disputed";

export interface LocalizedText {
  zh: string;
  en?: string;
}

export interface SectionConfig {
  id: SectionId;
  order: number;
  durationMin: number;
  weight: number;
  maxScore: number;
}

export interface PartConfig {
  id: string;
  section: SectionId;
  title: string;
  questionType: QuestionType;
  count: number;
  paperNos: [number, number];
}

export interface ExamConfig {
  schemaVersion: string;
  examId: string;
  displayName: LocalizedText;
  totalDurationMin: number;
  scoringPolicy: {
    mode: "percent_only";
    allowEstimate: boolean;
    disclaimer: string;
  };
  sections: SectionConfig[];
  parts: PartConfig[];
  writingTask: { paperNo: null; wordRange: [number, number] };
}

export interface Source {
  sourceId: string;
  kind: "paper_pdf" | "paper_docx" | "answer_key" | "audio" | "analysis" | "synthetic";
  host: string;
  path: string;
  retrievedAt: string;
  sha256?: string;
  note?: string;
}

export type AssetState = "external" | "bundled" | "user_provided" | "unavailable";

export interface Asset {
  assetId: string;
  type: "audio" | "image" | "pdf";
  mimeType: string;
  durationMs?: number;
  distribution: {
    state: AssetState;
    url?: string;
    referrer?: string;
    note?: string;
  };
  integrity?: { sha256?: string; bytes?: number };
  rights?: {
    status: "public_domain" | "third_party" | "licensed" | "unknown";
    note?: string;
  };
}

export interface TranscriptSentence {
  id: string;
  speaker?: string;
  text: string;
  startMs: number;
  endMs: number;
  align: "manual" | "forced" | "asr_estimate" | "none";
}

export interface Transcript {
  language: string;
  sentences: TranscriptSentence[];
  quality: "verified" | "asr_only" | "none";
}

export interface Paragraph {
  id: string;
  text: string;
}

export interface Material {
  materialId: string;
  section: SectionId;
  part: string;
  sharedAcrossVariants: boolean;
  availableForVariants?: string[];
  audio?: { assetId: string; durationMs: number };
  transcript?: Transcript;
  passage?: {
    title?: string;
    paragraphs: Paragraph[];
    wordCount: number;
  };
  wordBank?: string[];
  referenceTranslation?: { text: string; sourceId?: string };
}

export interface Option {
  optionId: string;
  text: string;
  semanticKey?: string;
}

export type Evidence =
  | {
      kind: "audio_span";
      fromSentenceId?: string;
      toSentenceId?: string;
      startMs?: number;
      endMs?: number;
      quote: string;
      note?: string;
    }
  | {
      kind: "text_span";
      paragraphId: string;
      sentenceIds?: string[];
      quote: string;
      note?: string;
    }
  | {
      kind: "paragraph_ref";
      paragraphId: string;
      quote: string;
      synonymPair?: { source: string; statement: string; note?: string };
      note?: string;
    }
  | {
      kind: "blank_clue";
      blankIndex: number;
      grammarClue: {
        pos?: string;
        tense?: string;
        collocation?: string;
        note?: string;
      };
    }
  | {
      kind: "reference_translation";
      segmentIndex: number;
      infoPoint: string;
    };

export interface Question {
  questionId: string;
  materialId: string;
  part: string;
  paperNo: number | null;
  type: QuestionType;
  stem: string;
  options: Option[];
  evidence: Evidence[];
  skills: SkillId[];
  traps?: TrapId[];
  difficulty: number;
  /** 原文/音频定位是否已人工标注；pending 表示先入库、后补锚点 */
  evidenceStatus?: "verified" | "pending";
  tagReview?: { status: "ai_draft" | "verified"; reviewedBy?: string[] };
  blankIndex?: number;
  paragraphLetters?: string[];
  allowVariantDiff?: boolean;
}

export interface Answer {
  questionId: string;
  optionId: string;
  semanticKey?: string;
  basis: AnswerBasis;
  derivedFrom: string[];
  conflicts: Array<{
    letter?: string;
    optionId?: string;
    sourceId: string;
    locator?: string;
    note?: string;
  }>;
  review: { status: ReviewStatus; by: string[]; at: string };
}

export interface AnswerKeyRecord {
  recordId: string;
  variantId: string;
  paperNo: number;
  /** letter = 选择题字母；word / paragraph = 选词填空与匹配题的语义答案 */
  mode?: "letter" | "word" | "paragraph";
  letter?: string;
  value?: string;
  sourceId: string;
  locator?: string;
  raw?: string;
}

export interface Variant {
  variantId: string;
  label: LocalizedText;
  questionSet: string[];
  optionOrders?: Record<string, string[]>;
  writingTaskId?: string;
  translationQuestionId?: string;
}

export interface WritingTask {
  writingTaskId: string;
  paperNo: null;
  prompt: string;
  requirements: string[];
  referenceEssays: Array<{ sourceId?: string; text: string; band?: string }>;
}

export interface Pack {
  schemaVersion: string;
  packId: string;
  examId: string;
  sessionId: string;
  kind: "exam" | "demo";
  title: LocalizedText;
  builtAt: string;
  builder?: { tool: string; version: string };
  sources: Source[];
  assets: Asset[];
  materials: Material[];
  questions: Question[];
  answers: Answer[];
  answerKeyRecords: AnswerKeyRecord[];
  variants: Variant[];
  writingTasks: WritingTask[];
  integrity?: { sha256?: string };
}

export interface ManifestPackEntry {
  packId: string;
  examId: string;
  sessionId: string;
  kind: "exam" | "demo";
  title: LocalizedText;
  path: string;
  questionCount: number;
  completeness: {
    hasPaperPdf: boolean;
    hasAnswerKey: boolean;
    hasAudio: boolean;
    audioCompleteness: "full" | "partial" | "none";
    note?: string;
  };
}

export interface Manifest {
  schemaVersion: string;
  updatedAt: string;
  exams: string[];
  packs: ManifestPackEntry[];
}
