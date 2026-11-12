import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ExamConfig, Material, Pack, Question, Variant } from "@cetnova/schema";
import { letterFor } from "@cetnova/schema";
import { gradeAttempt, percentText, type ResponseMap } from "@cetnova/engine";
import { db, loadResponses, type AttemptRow } from "../db/db.ts";
import { SECTION_LABEL, audioSource, loadExam, loadPack } from "../lib/content.ts";
import { AudioPlayer } from "../components/AudioPlayer.tsx";
import { Icon } from "../components/Icon.tsx";

const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

export default function Result() {
  const { attemptId = "" } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<AttemptRow | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [exam, setExam] = useState<ExamConfig | null>(null);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [seekRequest, setSeekRequest] = useState<{ ms: number; nonce: number } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const row = await db.attempts.get(attemptId);
        if (!row) throw new Error("记录不存在");
        if (!row.submitted) {
          navigate(`/exam/${attemptId}`, { replace: true });
          return;
        }
        const p = await loadPack(row.packPath);
        const e = await loadExam(row.examId);
        const v = p.variants.find((x) => x.variantId === row.variantId);
        if (!v) throw new Error("找不到套卷");
        setAttempt(row);
        setPack(p);
        setExam(e);
        setVariant(v);
        setResponses(await loadResponses(attemptId));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [attemptId, navigate]);

  const result = useMemo(() => {
    if (!pack || !variant) return null;
    return gradeAttempt(pack, variant, responses);
  }, [pack, variant, responses]);

  const listeningMaterial = useMemo(() => {
    if (!pack) return null;
    return (
      pack.materials.find((m) => m.audio && m.section === "listening") ?? null
    );
  }, [pack]);

  if (error) {
    return (
      <div className="exam-shell">
        <div className="empty">
          <div className="empty-title">无法打开结果</div>
          <div>{error}</div>
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => navigate("/")}>
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!attempt || !pack || !exam || !variant || !result) {
    return (
      <div className="exam-shell">
        <div className="empty">正在计算…</div>
      </div>
    );
  }

  const pct = result.percent;
  const writingTask = pack.writingTasks.find((t) => t.writingTaskId === variant.writingTaskId);

  return (
    <div className="exam-shell">
      <header className="exam-top">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>
          <Icon name="back" size={16} />
          首页
        </button>
        <span className="exam-title">
          {pack.title.zh}
          {pack.variants.length > 1 ? ` · ${variant.label.zh}` : ""}
        </span>
        <button
          className="btn btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={() => navigate("/library")}
        >
          再做一套
        </button>
      </header>

      <div className="exam-body" style={{ maxWidth: 900 }}>
        <div className="card result-head">
          <div className="ring">
            <svg className="ring-svg" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="ring-track" cx="60" cy="60" r="52" />
              <circle
                className="ring-arc"
                cx="60"
                cy="60"
                r="52"
                strokeDasharray={RING_CIRCUMFERENCE}
                style={
                  {
                    strokeDashoffset: RING_CIRCUMFERENCE * (1 - pct),
                    "--ring-full": RING_CIRCUMFERENCE,
                  } as CSSProperties
                }
              />
            </svg>
            <div className="ring-inner">
              <div className="ring-value">{Math.round(pct * 100)}</div>
              <div className="ring-label">客观题正确率 %</div>
            </div>
          </div>
          <div>
            <div className="badge badge-accent" style={{ marginBottom: 10 }}>
              练习报告
            </div>
            <h1 className="page-title" style={{ fontSize: 22 }}>
              {result.objectiveCorrect} / {result.objectiveTotal} 题正确
            </h1>
            <div className="muted" style={{ fontSize: 12.5, margin: "6px 0 18px" }}>
              用时 {Math.round((attempt.activeMs || 0) / 60000)} 分钟 ·{" "}
              {new Date(attempt.startedAt).toLocaleString("zh-CN")} ·{" "}
              正确率不等于官方六级成绩
            </div>
            {Object.entries(result.bySection).map(([key, bucket], index) => (
              <div className="bar-row" key={key}>
                <span className="muted">{SECTION_LABEL[key] ?? key}</span>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: percentText(bucket.percent),
                      animationDelay: `${index * 70}ms`,
                    }}
                  />
                </div>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {bucket.correct}/{bucket.total}
                </span>
              </div>
            ))}
          </div>
        </div>

        {listeningMaterial && (
          <div style={{ marginTop: 18 }}>
            <AudioPlayer
              src={audioSource(pack, listeningMaterial.audio?.assetId).src}
              externalUrl={audioSource(pack, listeningMaterial.audio?.assetId).externalUrl}
              durationMs={listeningMaterial.audio?.durationMs}
              sentences={listeningMaterial.transcript?.sentences ?? []}
              transcriptMode="always"
              seekRequest={seekRequest}
            />
          </div>
        )}

        <div className="section-head">
          <h2>逐题解析</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            点「听依据」跳到原文那句
          </span>
        </div>

        {result.items.map((item) => {
          const q = pack.questions.find((x) => x.questionId === item.questionId);
          if (!q) return null;
          if (q.type === "free_text") return null;
          const answer = pack.answers.find((a) => a.questionId === q.questionId);
          const expanded = open[q.questionId] ?? item.correct === false;
          const userText = displayValue(q, item.userOptionId, variant);
          const correctText = displayValue(q, item.correctOptionId, variant);
          return (
            <div
              key={item.questionId}
              className={`review-item ${item.correct ? "right" : "wrong"}`}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge">第 {q.paperNo} 题</span>
                <span className="badge">{exam.parts.find((p) => p.id === q.part)?.title}</span>
                {item.correct ? (
                  <span className="badge badge-ok">正确</span>
                ) : (
                  <span className="badge" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>
                    错误
                  </span>
                )}
                <button
                  className="expand-toggle"
                  style={{ marginLeft: "auto" }}
                  onClick={() => setOpen((o) => ({ ...o, [q.questionId]: !expanded }))}
                >
                  {expanded ? "收起" : "展开解析"}
                </button>
              </div>

              <p className={`review-stem ${q.stem ? "" : "q-stem-empty"}`}>
                {q.stem || "（本题题干在录音中）"}
              </p>

              <div className="answer-line">
                <span>
                  你的答案：
                  <span className={item.correct ? "pill-ok" : "pill-bad"}>
                    {userText || "未作答"}
                  </span>
                </span>
                <span>
                  正确答案：<span className="pill-ok">{correctText}</span>
                </span>
                {answer?.basis === "third_party_single" && (
                  <span className="badge badge-warn">单一来源</span>
                )}
                {answer && answer.conflicts.length > 0 && (
                  <span className="badge badge-warn">答案存在分歧</span>
                )}
              </div>

              {expanded && (
                <>
                  {q.evidence.length === 0 && (
                    <div className="evidence-box muted" style={{ fontSize: 13 }}>
                      暂无原文定位：这道题的答案依据尚未人工标注。
                    </div>
                  )}
                  {q.evidence.map((ev, i) => (
                    <div className="evidence-box" key={i}>
                      {"quote" in ev && ev.quote && <div>“{ev.quote}”</div>}
                      {ev.kind === "audio_span" && (
                        <button
                          className="btn btn-sm"
                          style={{ marginTop: 10 }}
                          onClick={() => {
                            setSeekRequest({
                              ms: ev.startMs ?? 0,
                              nonce: Date.now(),
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Icon name="play" size={12} /> 听依据
                        </button>
                      )}
                      {ev.kind === "paragraph_ref" && (
                        <div className="evidence-note">
                          定位段落 {ev.paragraphId}
                          {ev.synonymPair && (
                            <>
                              {" "}
                              · 同义替换：{ev.synonymPair.source} → {ev.synonymPair.statement}
                            </>
                          )}
                        </div>
                      )}
                      {ev.kind === "text_span" && (
                        <div className="evidence-note">定位段落 {ev.paragraphId}</div>
                      )}
                      {ev.kind === "blank_clue" && (
                        <div className="evidence-note">
                          {ev.grammarClue.pos && <>词性：{ev.grammarClue.pos}　</>}
                          {ev.grammarClue.tense && <>时态：{ev.grammarClue.tense}　</>}
                          {ev.grammarClue.collocation && <>搭配：{ev.grammarClue.collocation}　</>}
                          {ev.grammarClue.note}
                        </div>
                      )}
                      {"note" in ev && ev.note && (
                        <div className="evidence-note">解析：{ev.note}</div>
                      )}
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {q.skills.map((s) => (
                      <span className="badge" key={s}>
                        {SKILL_LABEL[s] ?? s}
                      </span>
                    ))}
                    {(q.traps ?? []).map((t) => (
                      <span className="badge badge-warn" key={t}>
                        干扰项：{TRAP_LABEL[t] ?? t}
                      </span>
                    ))}
                    <span className="badge">难度 {q.difficulty}/5</span>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {variant.translationQuestionId && (
          <TranslationReview
            pack={pack}
            variant={variant}
            responses={responses}
          />
        )}

        {writingTask && (
          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="badge badge-accent" style={{ marginBottom: 10 }}>
              写作
            </div>
            <div style={{ fontFamily: "var(--font-en)", fontSize: 16, marginBottom: 12 }}>
              {writingTask.prompt}
            </div>
            <div className="evidence-box" style={{ whiteSpace: "pre-wrap" }}>
              {(responses[`writing:${writingTask.writingTaskId}`]?.text ?? "").trim() ||
                "（未作答）"}
            </div>
            {writingTask.referenceEssays[0] && (
              <details style={{ marginTop: 12 }}>
                <summary className="expand-toggle">参考范文</summary>
                <div
                  className="evidence-box"
                  style={{ whiteSpace: "pre-wrap", marginTop: 8 }}
                >
                  {writingTask.referenceEssays[0].text}
                </div>
              </details>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              写作与翻译不自动评分：官方评分依赖人工阅卷与整体印象分，本版本不伪造分数。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TranslationReview({
  pack,
  variant,
  responses,
}: {
  pack: Pack;
  variant: Variant;
  responses: ResponseMap;
}) {
  const q = pack.questions.find((x) => x.questionId === variant.translationQuestionId);
  const material: Material | undefined = pack.materials.find((m) => m.materialId === q?.materialId);
  if (!q || !material) return null;
  const text = responses[q.questionId]?.text ?? "";
  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <div className="badge badge-accent" style={{ marginBottom: 10 }}>
        翻译
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
        原文
      </div>
      <div className="evidence-box" style={{ fontFamily: "var(--font-ui)" }}>
        {material.passage?.paragraphs.map((p) => p.text).join("")}
      </div>
      <div className="muted" style={{ fontSize: 12.5, margin: "14px 0 8px" }}>
        你的译文
      </div>
      <div className="evidence-box" style={{ whiteSpace: "pre-wrap" }}>
        {text.trim() || "（未作答）"}
      </div>
      {material.referenceTranslation && (
        <details style={{ marginTop: 12 }}>
          <summary className="expand-toggle">参考译文</summary>
          <div className="evidence-box" style={{ marginTop: 8 }}>
            {material.referenceTranslation.text}
          </div>
        </details>
      )}
    </div>
  );
}

function displayValue(q: Question, optionId: string | undefined, variant: Variant): string {
  if (!optionId) return "";
  if (optionId.startsWith("word:")) return optionId.slice(5);
  if (optionId.startsWith("para:")) return `段落 ${optionId.slice(5)}`;
  // 字母必须由该套卷的选项排列决定，不能用原始数组下标
  const letter = letterFor(variant, q, optionId);
  const option = q.options.find((o) => o.optionId === optionId);
  if (!letter || !option) return optionId;
  return `${letter}. ${option.text}`;
}

const SKILL_LABEL: Record<string, string> = {
  fact_detail: "事实细节",
  main_idea: "主旨大意",
  inference: "隐含推断",
  vocabulary_in_context: "词义推测",
  attitude_tone: "态度语气",
  purpose: "写作目的",
  structure: "篇章结构",
  listening_detail: "听力细节",
  listening_gist: "听力主旨",
};

const TRAP_LABEL: Record<string, string> = {
  literal_echo: "原词复现",
  partial_match: "半对半错",
  over_generalization: "过度概括",
  polarity_reversal: "正反颠倒",
  out_of_scope: "超出范围",
  wrong_attribution: "张冠李戴",
  similar_sound: "音近混淆",
  time_shift: "时间错位",
  distractor_from_other: "跨题干扰",
};
