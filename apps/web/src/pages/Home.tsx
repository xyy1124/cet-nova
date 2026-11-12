import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { Manifest } from "@cetnova/schema";
import { db, type AttemptRow } from "../db/db.ts";
import { loadManifest } from "../lib/content.ts";

export default function Home() {
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attempts = useLiveQuery(
    () => db.attempts.orderBy("startedAt").reverse().limit(30).toArray(),
    [],
    [] as AttemptRow[],
  );
  const wrongCount = useLiveQuery(
    () => db.reviewItems.filter((r) => !r.mastered).count(),
    [],
    0,
  );
  const vocabCount = useLiveQuery(() => db.vocab.count(), [], 0);

  useEffect(() => {
    loadManifest().then(setManifest).catch((e) => setError(String(e)));
  }, []);

  const finished = (attempts ?? []).filter((a) => a.submitted && a.percent != null);
  const avg =
    finished.length === 0
      ? null
      : finished.reduce((sum, a) => sum + (a.percent ?? 0), 0) / finished.length;
  const active = (attempts ?? []).find((a) => !a.submitted);

  const packTitle = (packId: string) =>
    manifest?.packs.find((p) => p.packId === packId)?.title.zh ?? packId;

  return (
    <div className="page">
      <div className="hero">
        <section className="card hero-main">
          <div className="hero-eyebrow">Offline first · 无账号</div>
          <h1 className="hero-title">
            把真题变成
            <br />
            可以逐句精听的练习
          </h1>
          <p className="hero-desc">
            听力原文按句对齐，答错能直接跳回那句证据；答案带来源与分歧标记，不用猜。
            所有记录只存在本机，断网也能做。
          </p>
          {active ? (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/exam/${active.attemptId}`)}
            >
              {active.mode === "review" ? "继续错题重练 →" : "继续上次练习 →"}
            </button>
          ) : (
            <Link className="btn btn-primary" to="/library">
              开始一套练习 →
            </Link>
          )}
        </section>

        <div className="hero-side">
          <div className="card stat-card">
            <span className="stat-value">{finished.length}</span>
            <span className="stat-label">已完成套卷</span>
          </div>
          <div className="card stat-card">
            <span className="stat-value">
              {avg === null ? "—" : `${Math.round(avg * 100)}%`}
            </span>
            <span className="stat-label">平均正确率（客观题）</span>
          </div>
          <div className="card stat-card">
            <span className="stat-value">
              {wrongCount}
              <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 8 }}>
                错题 · {vocabCount} 生词
              </span>
            </span>
            <span className="stat-label">待复习</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="card card-pad" style={{ color: "var(--bad)" }}>
          题库加载失败：{error}
        </div>
      )}

      <div className="section-head">
        <h2>最近练习</h2>
        <Link className="btn btn-ghost btn-sm" to="/wrong">
          查看错题本
        </Link>
      </div>

      {finished.length === 0 && !active ? (
        <div className="card empty">
          <div className="empty-title">还没有练习记录</div>
          <div>去试卷库拿一套演示卷试试，全部功能离线可用。</div>
          <div style={{ marginTop: 16 }}>
            <Link className="btn btn-primary" to="/library">
              打开试卷库
            </Link>
          </div>
        </div>
      ) : (
        <div className="pack-list">
          {(attempts ?? []).slice(0, 6).map((a) => (
            <div className="card pack-row" key={a.attemptId}>
              <div>
                <h3 className="pack-title">{packTitle(a.packId)}</h3>
                <div className="pack-meta">
                  <span className="badge">{a.variantId.toUpperCase()}</span>
                  {a.mode === "review" && <span className="badge">错题重练</span>}
                  <span className="badge">
                    {new Date(a.startedAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {a.submitted ? (
                    <span className="badge badge-ok">
                      正确率 {Math.round((a.percent ?? 0) * 100)}%
                    </span>
                  ) : (
                    <span className="badge badge-warn">未交卷</span>
                  )}
                </div>
              </div>
              <button
                className="btn btn-sm"
                onClick={() =>
                  navigate(a.submitted ? `/result/${a.attemptId}` : `/exam/${a.attemptId}`)
                }
              >
                {a.submitted ? "查看结果" : "继续"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2>这套系统怎么保证题是可信的</h2>
      </div>
      <div className="grid-2">
        <div className="card card-pad">
          <div className="badge badge-accent" style={{ marginBottom: 10 }}>
            答案溯源
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--ink-2)" }}>
            每道题的答案都记录来源文件与位置；多套卷的选项顺序不同，正确答案挂在选项语义上，
            而不是字母。跨卷对不上会在构建阶段直接失败。
          </div>
        </div>
        <div className="card card-pad">
          <div className="badge badge-accent" style={{ marginBottom: 10 }}>
            音频定位
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--ink-2)" }}>
            听力原文逐句带时间戳。做错后点「听依据」，播放器直接落到那句证据前 2 秒，
            不用自己拖进度条找。
          </div>
        </div>
      </div>
    </div>
  );
}
