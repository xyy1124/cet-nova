import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db.ts";
import { dictSize, loadCoreDict, lookupWord, normalizeWord } from "../lib/dict.ts";
import { toast } from "../components/Toast.tsx";

export default function Vocab() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ word: string; zh: string; pos: string } | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [dictReady, setDictReady] = useState(false);

  useEffect(() => {
    void loadCoreDict().then(() => setDictReady(true));
  }, []);

  const rows = useLiveQuery(() => db.vocab.orderBy("addedAt").reverse().toArray(), [], []);

  useEffect(() => {
    const word = normalizeWord(input);
    if (!word) {
      setResult(null);
      setNotFound(null);
      return;
    }
    const hit = lookupWord(word);
    setResult(hit ? { word: hit.word, zh: hit.entry.zh, pos: hit.entry.pos } : null);
    setNotFound(hit ? null : word);
  }, [input, dictReady]);

  async function add(lemma: string) {
    await db.vocab.put({
      lemma,
      addedAt: Date.now(),
      mastered: false,
    });
    setInput("");
    toast("已加入生词本");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">生词本</h1>
          <p className="page-desc">
            阅读时选中单词即可查义并加入。内置 CET6 核心词库（{dictSize()} 词）。
          </p>
        </div>
        <span className="badge">{rows?.length ?? 0} 词</span>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入一个英文单词，例如 conclusive"
          style={{
            width: "100%",
            height: 42,
            borderRadius: 10,
            border: "1px solid var(--line-strong)",
            background: "var(--surface-2)",
            padding: "0 14px",
            fontFamily: "var(--font-en)",
            fontSize: 16,
            outline: "none",
          }}
        />
        {result && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
              padding: "10px 12px",
              background: "var(--surface-2)",
              borderRadius: 8,
            }}
          >
            <strong style={{ fontFamily: "var(--font-en)", fontSize: 17 }}>{result.word}</strong>
            <span className="muted">{result.pos}</span>
            <span>{result.zh}</span>
            <button
              className="btn btn-sm btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={() => add(result.word)}
            >
              加入生词本
            </button>
          </div>
        )}
        {notFound && (
          <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            「{notFound}」未收录
          </div>
        )}
      </div>

      {rows && rows.length === 0 && (
        <div className="card empty">
          <div className="empty-title">生词本还是空的</div>
          <div>在阅读页选中任意单词，就能查到释义并一键收藏。</div>
        </div>
      )}

      <div className="pack-list">
        {rows?.map((row) => (
          <div className="card pack-row" key={row.lemma} style={{ padding: "14px 18px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-en)", fontSize: 18, fontWeight: 600 }}>
                {row.lemma}
              </div>
              {row.context && (
                <div
                  className="muted"
                  style={{ fontFamily: "var(--font-en)", fontSize: 13, marginTop: 2 }}
                >
                  {row.context}
                </div>
              )}
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                {new Date(row.addedAt).toLocaleDateString("zh-CN")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => db.vocab.update(row.lemma, { mastered: !row.mastered })}
              >
                {row.mastered ? "取消已掌握" : "标记已掌握"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => db.vocab.delete(row.lemma)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
