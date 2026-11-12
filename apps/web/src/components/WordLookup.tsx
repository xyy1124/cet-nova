import { useEffect, useMemo, useState } from "react";
import { db } from "../db/db.ts";
import { loadCoreDict, lookupWord, normalizeWord } from "../lib/dict.ts";
import { toast } from "./Toast.tsx";

interface Props {
  word: string;
  context?: string;
  questionId?: string;
  onClose: () => void;
}

export function WordLookup({ word, context, questionId, onClose }: Props) {
  const [ready, setReady] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    void loadCoreDict().then(() => setReady(true));
  }, []);

  const hit = useMemo(() => lookupWord(word), [word, ready]);

  async function add() {
    const lemma = hit?.word ?? normalizeWord(word);
    await db.vocab.put({
      lemma,
      context: context?.slice(0, 160),
      questionId,
      addedAt: Date.now(),
      mastered: false,
    });
    setAdded(true);
    toast("已加入生词本");
    window.setTimeout(onClose, 700);
  }

  return (
    <div
      className="lookup-sheet"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
        transform: "translateX(-50%)",
        width: "min(460px, calc(100vw - 28px))",
        zIndex: 60,
        background: "var(--surface)",
        border: "1px solid var(--line-strong)",
        borderRadius: 14,
        boxShadow: "var(--shadow)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontFamily: "var(--font-en)", fontSize: 19 }}>
          {hit?.word ?? normalizeWord(word)}
        </strong>
        {hit?.entry.phonetic && (
          <span className="muted" style={{ fontFamily: "var(--font-en)", fontSize: 13 }}>
            /{hit.entry.phonetic}/
          </span>
        )}
        {hit && <span className="muted">{hit.entry.pos}</span>}
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      {hit ? (
        <div style={{ marginTop: 6 }}>{hit.entry.zh}</div>
      ) : (
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          词库未收录这个词
        </div>
      )}
      {hit?.entry.note && (
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {hit.entry.note}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn btn-sm btn-primary" onClick={add} disabled={added}>
          {added ? "已加入" : "加入生词本"}
        </button>
        {context && (
          <span
            className="muted"
            style={{
              fontFamily: "var(--font-en)",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              alignSelf: "center",
            }}
          >
            …{context}…
          </span>
        )}
      </div>
    </div>
  );
}
