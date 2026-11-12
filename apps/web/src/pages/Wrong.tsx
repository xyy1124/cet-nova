import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { Pack, Question } from "@cetnova/schema";
import { createAttempt, db } from "../db/db.ts";
import { loadManifest, loadPack, partLabel } from "../lib/content.ts";
import { toast } from "../components/Toast.tsx";

interface Indexed {
  pack: Pack;
  question: Question;
  variantId: string;
}

export default function Wrong() {
  const navigate = useNavigate();
  const [index, setIndex] = useState<Record<string, Indexed>>({});
  const [loading, setLoading] = useState(true);

  const rows = useLiveQuery(
    () => db.reviewItems.orderBy("lastWrongAt").reverse().toArray(),
    [],
    [],
  );

  useEffect(() => {
    (async () => {
      const manifest = await loadManifest();
      const map: Record<string, Indexed> = {};
      for (const entry of manifest.packs) {
        const pack = await loadPack(entry.path);
        for (const q of pack.questions) {
          const variant = pack.variants.find((v) => v.questionSet.includes(q.questionId));
          if (variant) map[q.questionId] = { pack, question: q, variantId: variant.variantId };
        }
      }
      setIndex(map);
      setLoading(false);
    })();
  }, []);

  const active = (rows ?? []).filter((r) => !r.mastered && index[r.questionId]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof active>();
    for (const row of active) {
      const packId = index[row.questionId].pack.packId;
      const list = map.get(packId) ?? [];
      list.push(row);
      map.set(packId, list);
    }
    return [...map.entries()];
  }, [active, index]);

  async function startReview(packId: string, questionIds: string[]) {
    const first = index[questionIds[0]];
    const attempt = await createAttempt({
      packId,
      packPath: `sessions/${first.pack.sessionId}/pack.json`,
      examId: first.pack.examId,
      variantId: first.variantId,
      mode: "review",
      questionIds,
    });
    navigate(`/exam/${attempt.attemptId}`);
  }

  async function markMastered(questionId: string) {
    const row = await db.reviewItems.get(questionId);
    if (row) await db.reviewItems.put({ ...row, mastered: true });
    toast("已移出错题本");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">错题本</h1>
          <p className="page-desc">答错的题自动收集，按错误次数排序。移出后历史记录仍保留。</p>
        </div>
        <span className="badge">{active.length} 道待复习</span>
      </div>

      {loading && <div className="empty">正在整理…</div>}

      {!loading && active.length === 0 && (
        <div className="card empty">
          <div className="empty-title">还没有错题</div>
          <div>做完一套卷后，答错的题会自动出现在这里。</div>
        </div>
      )}

      {groups.map(([packId, items]) => (
        <div key={packId} style={{ marginBottom: 26 }}>
          <div className="section-head" style={{ marginTop: 8 }}>
            <h2>{index[items[0].questionId].pack.title.zh}</h2>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => startReview(packId, items.map((i) => i.questionId))}
            >
              只练这 {items.length} 道
            </button>
          </div>
          {items.map((row) => {
            const { question } = index[row.questionId];
            return (
              <div className="review-item wrong" key={row.questionId}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge">第 {question.paperNo} 题</span>
                  <span className="badge">{partLabel(question.part)}</span>
                  <span className="badge badge-warn">错 {row.wrongCount} 次</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => markMastered(row.questionId)}
                  >
                    已掌握
                  </button>
                </div>
                <p className="review-stem">{question.stem}</p>
                <details>
                  <summary className="expand-toggle">看答案与依据</summary>
                  <div className="evidence-box" style={{ marginTop: 8 }}>
                    {"quote" in question.evidence[0] && question.evidence[0].quote
                      ? `“${question.evidence[0].quote}”`
                      : "见解析"}
                    {"note" in question.evidence[0] && question.evidence[0].note && (
                      <div className="evidence-note">{question.evidence[0].note}</div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
