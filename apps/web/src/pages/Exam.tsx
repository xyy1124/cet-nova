import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  ExamConfig,
  Material,
  Pack,
  Question,
  SectionId,
  Variant,
} from "@cetnova/schema";
import { optionOrderFor } from "@cetnova/schema";
import {
  gradeAttempt,
  type ResponseMap,
  type UserResponse,
} from "@cetnova/engine";
import {
  applyReviewResults,
  db,
  loadResponses,
  saveResponse,
  type AttemptRow,
} from "../db/db.ts";
import { SECTION_LABEL, audioSource, loadExam, loadPack } from "../lib/content.ts";
import { useSettings } from "../lib/settings.tsx";
import { AudioPlayer } from "../components/AudioPlayer.tsx";
import { Icon } from "../components/Icon.tsx";
import { WordLookup } from "../components/WordLookup.tsx";

const SECTION_ORDER: SectionId[] = ["listening", "reading", "writing", "translation"];

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Exam() {
  const { attemptId = "" } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [attempt, setAttempt] = useState<AttemptRow | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [exam, setExam] = useState<ExamConfig | null>(null);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [section, setSection] = useState<SectionId>("listening");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeBlank, setActiveBlank] = useState<number | null>(null);
  const autoSubmitted = useRef(false);
  const [lookup, setLookup] = useState<{
    word: string;
    context: string;
    questionId?: string;
  } | null>(null);
  const blankRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    (async () => {
      try {
        const row = await db.attempts.get(attemptId);
        if (!row) throw new Error("练习记录不存在");
        const loadedPack = await loadPack(row.packPath);
        const loadedExam = await loadExam(row.examId);
        const v = loadedPack.variants.find((x) => x.variantId === row.variantId);
        if (!v) throw new Error("找不到套卷");
        setAttempt(row);
        setPack(loadedPack);
        setExam(loadedExam);
        setVariant(v);
        setResponses(await loadResponses(attemptId));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [attemptId]);

  useEffect(() => {
    if (!attempt) return;
    const tick = () => setElapsed(Date.now() - attempt.startedAt);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  const questions = useMemo(() => {
    if (!pack || !variant) return [] as Question[];
    const ids = attempt?.questionIds ?? variant.questionSet;
    return ids
      .map((id) => pack.questions.find((q) => q.questionId === id))
      .filter((q): q is Question => Boolean(q));
  }, [pack, variant, attempt]);

  const writingTask = useMemo(() => {
    if (!pack || !variant?.writingTaskId) return undefined;
    return pack.writingTasks.find((t) => t.writingTaskId === variant.writingTaskId);
  }, [pack, variant]);

  const sections = useMemo(() => {
    const present = new Set(questions.map((q) => q.part.split(".")[0] as SectionId));
    if (writingTask) present.add("writing");
    return SECTION_ORDER.filter((s) => present.has(s));
  }, [questions, writingTask]);

  useEffect(() => {
    if (sections.length > 0 && !sections.includes(section)) {
      setSection(sections[0]);
    }
  }, [sections, section]);

  const sectionQuestions = questions.filter(
    (q) => (q.part.split(".")[0] as SectionId) === section,
  );

  const isExam = attempt?.mode === "exam";
  const examLimitMs = (exam?.totalDurationMin ?? 130) * 60000;
  const remaining = Math.max(0, examLimitMs - elapsed);

  useEffect(() => {
    if (!isExam || attempt?.submitted || autoSubmitted.current) return;
    if (remaining <= 0) {
      autoSubmitted.current = true;
      void submit(true);
    }
  }, [remaining, isExam, attempt?.submitted]);

  function setResp(questionId: string, patch: UserResponse) {
    setResponses((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch },
    }));
    void saveResponse(attemptId, questionId, patch as never);
  }

  function handleSelection(questionId?: string) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!/^[A-Za-z][A-Za-z'-]{1,30}$/.test(text)) return;
    let node: Node | null = sel.anchorNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    const context =
      (node as HTMLElement | null)
        ?.closest("p, .para, .passage-text")
        ?.textContent?.trim()
        .slice(0, 120) ?? "";
    setLookup({ word: text, context, questionId });
  }

  function answeredCount() {
    const objective = questions.filter((q) => {
      if (q.type === "free_text") return Boolean(responses[q.questionId]?.text?.trim());
      return Boolean(responses[q.questionId]?.optionId);
    }).length;
    const writing = writingTask
      ? Boolean(responses[`writing:${writingTask.writingTaskId}`]?.text?.trim())
      : false;
    return objective + (writing ? 1 : 0);
  }

  async function submit(force = false) {
    if (!attempt || !pack || !variant || !exam || submitting) return;
    const unanswered = questions.filter(
      (q) => q.type !== "free_text" && !responses[q.questionId]?.optionId,
    ).length;
    if (!force) {
      const msg =
        unanswered > 0
          ? `还有 ${unanswered} 道客观题未作答，确定交卷？`
          : "确定交卷？交卷后可以看到答案与解析。";
      if (!window.confirm(msg)) return;
    }

    setSubmitting(true);
    try {
      const result = gradeAttempt(pack, variant, responses);
      await db.attempts.update(attemptId, {
        submitted: true,
        submittedAt: Date.now(),
        activeMs: Date.now() - attempt.startedAt,
        percent: result.percent,
        objectiveCorrect: result.objectiveCorrect,
        objectiveTotal: result.objectiveTotal,
      });
      await applyReviewResults(pack.packId, result.items);
      navigate(`/result/${attemptId}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="exam-shell">
        <div className="empty">
          <div className="empty-title">无法打开练习</div>
          <div>{error}</div>
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => navigate("/library")}>
              返回试卷库
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!attempt || !pack || !variant || !exam) {
    return (
      <div className="exam-shell">
        <div className="empty">正在加载…</div>
      </div>
    );
  }

  const writingTaskForHeader = pack.writingTasks.find(
    (t) => t.writingTaskId === variant.writingTaskId,
  );

  return (
    <div className="exam-shell">
      <header className="exam-top">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>
          <Icon name="back" size={16} />
          退出
        </button>
        <span className="exam-title">
          {pack.title.zh}
          {pack.variants.length > 1 ? ` · ${variant.label.zh}` : ""}
        </span>
        <span className="badge">
          {answeredCount()}/{questions.length + (writingTaskForHeader ? 1 : 0)}
        </span>
        {isExam && <span className="badge badge-warn">考试模式</span>}
        <span className={`exam-timer ${isExam && remaining < 300000 ? "urgent" : ""}`}>
          {formatClock(isExam ? remaining : elapsed)}
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => submit()} disabled={submitting}>
          {submitting ? "批改中…" : "交卷"}
        </button>
      </header>

      <nav className="section-tabs">
        {sections.map((s) => {
          const count =
            s === "writing"
              ? 1
              : questions.filter((q) => q.part.startsWith(s)).length;
          return (
            <button
              key={s}
              className={`section-tab ${section === s ? "active" : ""}`}
              onClick={() => setSection(s)}
            >
              {SECTION_LABEL[s] ?? s} <span className="muted">{count}</span>
            </button>
          );
        })}
      </nav>

      <div className="exam-body">
        <div className="qn-strip">
          {sectionQuestions
            .filter((q) => q.paperNo !== null)
            .map((q) => {
              const done = Boolean(responses[q.questionId]?.optionId);
              return (
                <button
                  key={q.questionId}
                  className={`qn ${done ? "done" : ""} ${
                    responses[q.questionId]?.flagged ? "flagged" : ""
                  }`}
                  onClick={() =>
                    document
                      .getElementById(`q-${q.questionId}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  style={{ position: "relative" }}
                >
                  {q.paperNo}
                </button>
              );
            })}
        </div>

        {section === "listening" &&
          groupByMaterial(sectionQuestions, pack.materials).map(([material, qs]) => {
            const audio = audioSource(pack, material.audio?.assetId);
            return (
              <div key={material.materialId} style={{ marginBottom: 26 }}>
                <AudioPlayer
                  src={audio.src}
                  externalUrl={audio.externalUrl}
                  durationMs={material.audio?.durationMs}
                  sentences={material.transcript?.sentences ?? []}
                  transcriptMode={settings.transcript}
                  initialRate={settings.rate}
                />
                {qs.map((q) => (
                  <SingleChoice
                    key={q.questionId}
                    q={q}
                    variant={variant}
                    exam={exam}
                    value={responses[q.questionId]?.optionId}
                    onSelect={(optionId) => setResp(q.questionId, { optionId })}
                  />
                ))}
              </div>
            );
          })}

        {section === "reading" &&
          groupByMaterial(sectionQuestions, pack.materials).map(([material, qs]) => {
            if (material.part === "reading.p1") {
              return (
                <Cloze
                  key={material.materialId}
                  material={material}
                  questions={qs}
                  responses={responses}
                  activeBlank={activeBlank}
                  setActiveBlank={setActiveBlank}
                  onFill={(questionId, word) => {
                    setResp(questionId, { optionId: `word:${word}` });
                    const next = qs.find(
                      (q) =>
                        (q.blankIndex ?? 0) > (qs.find((x) => x.questionId === questionId)?.blankIndex ?? 0) &&
                        !responses[q.questionId]?.optionId &&
                        q.questionId !== questionId,
                    );
                    if (next) setActiveBlank(next.blankIndex ?? null);
                    else setActiveBlank(null);
                  }}
                  onClear={(questionId) => setResp(questionId, { optionId: "" })}
                  onSelectWord={() => handleSelection()}
                  registerBlank={(idx, el) => (blankRefs.current[idx] = el)}
                />
              );
            }
            if (material.part === "reading.p2") {
              return (
                <Match
                  key={material.materialId}
                  material={material}
                  questions={qs}
                  responses={responses}
                  onSelectWord={() => handleSelection()}
                  onSelect={(questionId, letter) =>
                    setResp(questionId, { optionId: `para:${letter}` })
                  }
                />
              );
            }
            return (
              <div key={material.materialId} className="reading-split" style={{ marginBottom: 26 }}>
                <div className="card passage-panel">
                  <h3 className="passage-title">{material.passage?.title}</h3>
                  <div className="passage-text" onMouseUp={() => handleSelection()}>
                    {material.passage?.paragraphs.map((p) => (
                      <p key={p.id}>{p.text}</p>
                    ))}
                  </div>
                </div>
                <div>
                  {qs.map((q) => (
                    <SingleChoice
                      key={q.questionId}
                      q={q}
                      variant={variant}
                      exam={exam}
                      value={responses[q.questionId]?.optionId}
                      onSelect={(optionId) => setResp(q.questionId, { optionId })}
                    />
                  ))}
                </div>
              </div>
            );
          })}

        {section === "translation" &&
          sectionQuestions.map((q) => {
            const material = pack.materials.find((m) => m.materialId === q.materialId);
            return (
              <div className="card q-card" key={q.questionId} id={`q-${q.questionId}`}>
                <div className="q-meta">
                  <span className="badge badge-accent">汉译英</span>
                  <span className="badge">题号 {q.paperNo}</span>
                </div>
                <p className="q-stem">将下面的中文段落译成英文。</p>
                <div className="evidence-box" style={{ fontFamily: "var(--font-ui)", fontSize: 15 }}>
                  {material?.passage?.paragraphs.map((p) => (
                    <p key={p.id} style={{ margin: 0 }}>
                      {p.text}
                    </p>
                  ))}
                </div>
                <textarea
                  className="editor"
                  style={{ marginTop: 16, minHeight: 220 }}
                  placeholder="在这里写下你的译文…"
                  value={responses[q.questionId]?.text ?? ""}
                  onChange={(e) => setResp(q.questionId, { text: e.target.value })}
                />
                <div className="word-count">
                  {(responses[q.questionId]?.text ?? "").trim().split(/\s+/).filter(Boolean).length} words
                </div>
              </div>
            );
          })}

        {section === "writing" && writingTask && (
          <div className="card q-card" id="q-writing">
            <div className="q-meta">
              <span className="badge badge-accent">写作</span>
              <span className="badge">{writingTask.requirements[0]}</span>
            </div>
            <p className="q-stem">{writingTask.prompt}</p>
            <ul style={{ margin: "0 0 16px", paddingLeft: 20, color: "var(--muted)", fontSize: 13 }}>
              {writingTask.requirements.slice(1).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <textarea
              className="editor"
              placeholder="在这里起草你的作文…"
              value={responses[`writing:${writingTask.writingTaskId}`]?.text ?? ""}
              onChange={(e) =>
                setResp(`writing:${writingTask.writingTaskId}`, { text: e.target.value })
              }
            />
            <div className="word-count">
              {
                (responses[`writing:${writingTask.writingTaskId}`]?.text ?? "")
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean).length
              }{" "}
              words
            </div>
          </div>
        )}

        {section === "writing" && !writingTask && (
          <div className="empty">本套没有写作题</div>
        )}

        {lookup && (
          <WordLookup
            word={lookup.word}
            context={lookup.context}
            questionId={lookup.questionId}
            onClose={() => setLookup(null)}
          />
        )}
      </div>
    </div>
  );
}

function groupByMaterial(
  questions: Question[],
  materials: Material[],
): Array<[Material, Question[]]> {
  const map = new Map<string, Question[]>();
  for (const q of questions) {
    const list = map.get(q.materialId) ?? [];
    list.push(q);
    map.set(q.materialId, list);
  }
  return [...map.entries()]
    .map(([id, qs]) => [materials.find((m) => m.materialId === id), qs] as const)
    .filter((pair): pair is readonly [Material, Question[]] => Boolean(pair[0]))
    .map(([m, qs]) => [m, qs] as [Material, Question[]]);
}

function SingleChoice({
  q,
  variant,
  exam,
  value,
  onSelect,
}: {
  q: Question;
  variant: Variant;
  exam: ExamConfig;
  value?: string;
  onSelect: (optionId: string) => void;
}) {
  const order = optionOrderFor(variant, q);
  const part = exam.parts.find((p) => p.id === q.part);
  return (
    <div className="card q-card" id={`q-${q.questionId}`} style={{ marginBottom: 14 }}>
      <div className="q-meta">
        <span className="badge badge-accent">第 {q.paperNo} 题</span>
        <span className="badge">{part?.title}</span>
        <span className="badge">难度 {"●".repeat(q.difficulty)}</span>
      </div>
      <p className={`q-stem ${q.stem ? "" : "q-stem-empty"}`}>
        {q.stem || "（本题题干在录音中，请听录音作答）"}
      </p>
      <div className="options">
        {order.map((optionId, index) => {
          const option = q.options.find((o) => o.optionId === optionId);
          if (!option) return null;
          const letter = String.fromCharCode(65 + index);
          return (
            <button
              key={optionId}
              className={`opt ${value === optionId ? "selected" : ""}`}
              onClick={() => onSelect(optionId)}
            >
              <span className="opt-key">{letter}</span>
              <span className="opt-text">{option.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Cloze({
  material,
  questions,
  responses,
  activeBlank,
  setActiveBlank,
  onFill,
  onClear,
  onSelectWord,
}: {
  material: Material;
  questions: Question[];
  responses: ResponseMap;
  activeBlank: number | null;
  setActiveBlank: (n: number | null) => void;
  onFill: (questionId: string, word: string) => void;
  onClear: (questionId: string) => void;
  onSelectWord: () => void;
  registerBlank?: (idx: number, el: HTMLElement | null) => void;
}) {
  const byBlank = new Map(questions.map((q) => [q.blankIndex ?? -1, q]));
  const usedWords = new Set(
    questions.map((q) => responses[q.questionId]?.optionId?.replace("word:", "")).filter(Boolean),
  );
  const bank = material.wordBank ?? [];

  function renderText(text: string) {
    return text.split(/(\{\{\d+\}\})/g).map((part, i) => {
      const match = part.match(/^\{\{(\d+)\}\}$/);
      if (!match) return <span key={i}>{part}</span>;
      const idx = Number(match[1]);
      const q = byBlank.get(idx);
      const word = q ? responses[q.questionId]?.optionId?.replace("word:", "") : "";
      return (
        <button
          key={i}
          className={`blank ${word ? "filled" : ""} ${activeBlank === idx ? "active" : ""}`}
          onClick={() => setActiveBlank(activeBlank === idx ? null : idx)}
        >
          {word || q?.paperNo || `${idx}`}
        </button>
      );
    });
  }

  return (
    <div className="reading-split" style={{ marginBottom: 18 }}>
      <div className="card passage-panel">
        <div className="q-meta">
          <span className="badge badge-accent">选词填空</span>
          <span className="badge">
            {bank.length} 选 {questions.length}
          </span>
          <span className="badge">
            题号 {questions[0]?.paperNo}–{questions[questions.length - 1]?.paperNo}
          </span>
        </div>
        <h3 className="passage-title">{material.passage?.title}</h3>
        <div className="passage-text" onMouseUp={() => onSelectWord()}>
          {material.passage?.paragraphs.map((p) => (
            <p key={p.id}>{renderText(p.text)}</p>
          ))}
        </div>
      </div>

      <div className="card q-card" style={{ alignSelf: "start" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {activeBlank ? `已选中第 ${activeBlank} 空，点单词填入` : "先点左侧空格，再点单词"}
        </div>
        <div
          className="wordbank"
          style={{ marginTop: 10, paddingTop: 0, borderTop: "none" }}
        >
          {bank.map((word) => {
            const used = usedWords.has(word);
            return (
              <button
                key={word}
                className={`word ${used ? "used" : ""}`}
                onClick={() => {
                  if (!activeBlank) return;
                  const q = byBlank.get(activeBlank);
                  if (!q) return;
                  onFill(q.questionId, word);
                }}
              >
                {word}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          {questions.map((q) => {
            const word = responses[q.questionId]?.optionId?.replace("word:", "");
            return (
              <div
                key={q.questionId}
                id={`q-${q.questionId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderTop: "1px dashed var(--line)",
                  fontSize: 13,
                }}
              >
                <span className="muted">第 {q.paperNo} 题</span>
                <span className={word ? "pill-ok" : "muted"}>{word || "未填"}</span>
                {word && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onClear(q.questionId)}
                  >
                    清除
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Match({
  material,
  questions,
  responses,
  onSelect,
  onSelectWord,
}: {
  material: Material;
  questions: Question[];
  responses: ResponseMap;
  onSelect: (questionId: string, letter: string) => void;
  onSelectWord: () => void;
}) {
  const letters = material.passage?.paragraphs.map((p) => p.id) ?? [];
  return (
    <div className="reading-split" style={{ marginBottom: 18 }}>
      <div className="card passage-panel">
        <div className="q-meta">
          <span className="badge badge-accent">长篇阅读 · 信息匹配</span>
          <span className="badge">{letters.length} 段</span>
        </div>
        <h3 className="passage-title">{material.passage?.title}</h3>
        <div className="passage-text" onMouseUp={() => onSelectWord()}>
          {material.passage?.paragraphs.map((p) => (
            <div className="para" key={p.id}>
              <span className="para-letter">{p.id}</span>
              <span>{p.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card q-card" style={{ alignSelf: "start" }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          为每条陈述选择对应段落，段落可重复选择
        </div>
        {questions.map((q) => {
          const value = responses[q.questionId]?.optionId?.replace("para:", "") ?? "";
          return (
            <div className="statement" key={q.questionId} id={`q-${q.questionId}`}>
              <span className="statement-text">
                <span className="muted mono" style={{ marginRight: 8 }}>
                  {q.paperNo}
                </span>
                {q.stem}
              </span>
              <select
                className={value ? "answered" : ""}
                value={value}
                onChange={(e) => onSelect(q.questionId, e.target.value)}
              >
                <option value="">—</option>
                {letters.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
