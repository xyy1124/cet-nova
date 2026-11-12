import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Manifest, Pack } from "@cetnova/schema";
import { createAttempt } from "../db/db.ts";
import { loadManifest, loadPack } from "../lib/content.ts";

interface Loaded {
  pack: Pack;
  manifestPath: string;
  manifestPack: Manifest["packs"][number];
}

export default function Library() {
  const navigate = useNavigate();
  const [packs, setPacks] = useState<Loaded[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const manifest = await loadManifest();
        const loaded = await Promise.all(
          manifest.packs.map(async (entry) => {
            const pack = await loadPack(entry.path);
            return { pack, manifestPath: entry.path, manifestPack: entry };
          }),
        );
        setPacks(loaded);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  async function start(
    pack: Pack,
    path: string,
    variantId: string,
    mode: "full" | "exam",
  ) {
    setStarting(`${pack.packId}:${variantId}:${mode}`);
    try {
      const attempt = await createAttempt({
        packId: pack.packId,
        packPath: path,
        examId: pack.examId,
        variantId,
        mode,
      });
      navigate(`/exam/${attempt.attemptId}`);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">试卷库</h1>
          <p className="page-desc">
            V0.1 只收录经过校验的卷。演示卷题量做了删减，但结构与真实试卷一致。
          </p>
        </div>
        <span className="badge">{packs.length} 份内容包</span>
      </div>

      {error && (
        <div className="card card-pad" style={{ color: "var(--bad)" }}>
          加载失败：{error}
        </div>
      )}

      {!error && packs.length === 0 && (
        <div className="pack-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="card skeleton skeleton-card" key={i} />
          ))}
        </div>
      )}

      <div className="pack-list">
        {packs.map(({ pack, manifestPath, manifestPack }) => {
          const objective = pack.questions.filter((q) => q.type !== "free_text").length;
          const audio = pack.assets.filter((a) => a.type === "audio").length;
          return (
            <article className="card pack-row" key={pack.packId}>
              <div>
                <h2 className="pack-title">
                  {pack.title.zh}
                  {pack.kind === "demo" && (
                    <span className="badge badge-warn" style={{ marginLeft: 10 }}>
                      演示 · 非真题
                    </span>
                  )}
                </h2>
                <div className="pack-meta">
                  <span className="badge">
                    {pack.examId.toUpperCase()} · {pack.sessionId}
                  </span>
                  <span className="badge">{objective} 道客观题</span>
                  <span className={`badge ${audio > 0 ? "badge-ok" : ""}`}>
                    {audio > 0 ? "含音频" : "无音频 · 原文模式"}
                  </span>
                  <span className="badge">
                    {manifestPack.completeness.hasAnswerKey ? "答案已核" : "答案待核"}
                  </span>
                </div>
                <div className="variant-chips">
                  {pack.variants.map((v) => (
                    <span
                      key={v.variantId}
                      style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
                    >
                      <button
                        className="variant-chip"
                        disabled={starting !== null}
                        onClick={() => start(pack, manifestPath, v.variantId, "full")}
                      >
                        {starting === `${pack.packId}:${v.variantId}:full`
                          ? "准备中…"
                          : `${v.label.zh} · 练习`}
                      </button>
                      <button
                        className="variant-chip"
                        disabled={starting !== null}
                        onClick={() => start(pack, manifestPath, v.variantId, "exam")}
                        title="130 分钟倒计时，到点自动交卷"
                      >
                        {starting === `${pack.packId}:${v.variantId}:exam`
                          ? "准备中…"
                          : "考试"}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 140 }}>
                <div className="mono muted">
                  {pack.questions.length} 题 / {pack.variants.length} 套
                </div>
                {manifestPack.completeness.note && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--muted)",
                      marginTop: 6,
                      maxWidth: 220,
                      lineHeight: 1.5,
                    }}
                  >
                    {manifestPack.completeness.note}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
