import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db.ts";
import { useSettings, type ThemeChoice } from "../lib/settings.tsx";

export default function Settings() {
  const { settings, update } = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const counts = useLiveQuery(async () => {
    const [attempts, responses, reviewItems, vocab] = await Promise.all([
      db.attempts.count(),
      db.responses.count(),
      db.reviewItems.count(),
      db.vocab.count(),
    ]);
    return { attempts, responses, reviewItems, vocab };
  }, []);

  async function exportAll() {
    const [attempts, responses, reviewItems, vocab] = await Promise.all([
      db.attempts.toArray(),
      db.responses.toArray(),
      db.reviewItems.toArray(),
      db.vocab.toArray(),
    ]);
    const payload = {
      app: "cetnova",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      data: { attempts, responses, reviewItems, vocab },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cetnova-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("已导出备份文件");
  }

  async function importAll(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as {
        app?: string;
        data?: {
          attempts?: unknown[];
          responses?: unknown[];
          reviewItems?: unknown[];
          vocab?: unknown[];
        };
      };
      if (payload.app !== "cetnova" || !payload.data) {
        setMessage("这不是 CET Nova 的备份文件");
        return;
      }
      const { attempts = [], responses = [], reviewItems = [], vocab = [] } = payload.data;
      await db.transaction("rw", db.attempts, db.responses, db.reviewItems, db.vocab, async () => {
        await db.attempts.bulkPut(attempts as never[]);
        await db.responses.bulkPut(responses as never[]);
        await db.reviewItems.bulkPut(reviewItems as never[]);
        await db.vocab.bulkPut(vocab as never[]);
      });
      setMessage(
        `导入完成：${attempts.length} 次练习 / ${responses.length} 条作答 / ${vocab.length} 个生词`,
      );
    } catch (e) {
      setMessage(`导入失败：${String(e)}`);
    }
  }

  async function clearAll() {
    if (!window.confirm("将清除本机全部练习记录、错题与生词，且不可恢复。确定继续？")) return;
    await db.transaction("rw", db.attempts, db.responses, db.reviewItems, db.vocab, async () => {
      await db.attempts.clear();
      await db.responses.clear();
      await db.reviewItems.clear();
      await db.vocab.clear();
    });
    setMessage("已清空本机数据");
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-desc">所有设置与数据都只保存在这台设备上。</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="setting-row">
          <div>
            <div className="setting-title">主题</div>
            <div className="setting-desc">跟随系统会在夜间自动切换</div>
          </div>
          <div className="seg">
            {(
              [
                ["system", "跟随系统"],
                ["light", "浅色"],
                ["dark", "深色"],
              ] as Array<[ThemeChoice, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                className={settings.theme === value ? "active" : ""}
                onClick={() => update({ theme: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-title">阅读字号</div>
            <div className="setting-desc">影响文章正文</div>
          </div>
          <div className="seg">
            <button
              className={settings.fontSize === "normal" ? "active" : ""}
              onClick={() => update({ fontSize: "normal" })}
            >
              标准
            </button>
            <button
              className={settings.fontSize === "large" ? "active" : ""}
              onClick={() => update({ fontSize: "large" })}
            >
              大
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-title">听力原文</div>
            <div className="setting-desc">盲听模式下答题时完全隐藏原文</div>
          </div>
          <div className="seg">
            {(
              [
                ["blind", "盲听"],
                ["hint", "逐句揭示"],
                ["always", "始终显示"],
              ] as Array<[typeof settings.transcript, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                className={settings.transcript === value ? "active" : ""}
                onClick={() => update({ transcript: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-title">默认播放速度</div>
            <div className="setting-desc">进入听力页时生效</div>
          </div>
          <div className="seg">
            {[0.75, 1, 1.25, 1.5].map((r) => (
              <button
                key={r}
                className={settings.rate === r ? "active" : ""}
                onClick={() => update({ rate: r })}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="setting-row">
          <div>
            <div className="setting-title">本机数据</div>
            <div className="setting-desc">
              {counts
                ? `${counts.attempts} 次练习 · ${counts.responses} 条作答 · ${counts.reviewItems} 道错题 · ${counts.vocab} 个生词`
                : "统计中…"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={exportAll}>
              导出 JSON
            </button>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              导入
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importAll(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-title" style={{ color: "var(--bad)" }}>
              清除全部数据
            </div>
            <div className="setting-desc">不可恢复，建议先导出备份</div>
          </div>
          <button className="btn btn-sm" onClick={clearAll}>
            清除
          </button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="badge badge-accent" style={{ marginBottom: 10 }}>
          关于
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--ink-2)" }}>
          <p style={{ margin: "0 0 8px" }}>
            CET Nova v0.1 · 代码 MIT。当前内容包为<strong>本项目原创的演示内容</strong>，
            听力为 Windows TTS 合成，不是真题录音。
          </p>
          <p style={{ margin: "0 0 8px" }}>
            正式版不会随代码分发真题与音频：应用只保存元数据与校验和，
            音频由用户从公开来源自行获取，或按本地文件导入。
          </p>
          <p style={{ margin: 0 }}>
            官方成绩采用常模参照与等值转换，本软件不提供官方分数，只显示练习正确率。
          </p>
        </div>
      </div>

      {message && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          {message}
        </div>
      )}
    </div>
  );
}
