import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TranscriptSentence } from "@cetnova/schema";
import { Icon } from "./Icon.tsx";

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  src: string | null;
  externalUrl?: string | null;
  durationMs?: number;
  sentences?: TranscriptSentence[];
  transcriptMode?: "blind" | "hint" | "always";
  initialRate?: number;
  seekRequest?: { ms: number; nonce: number } | null;
  compact?: boolean;
}

export function AudioPlayer({
  src,
  externalUrl = null,
  durationMs = 0,
  sentences = [],
  transcriptMode = "blind",
  initialRate = 1,
  seekRequest,
  compact = false,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [localSrc, setLocalSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [rate, setRate] = useState(initialRate);
  const [revealed, setRevealed] = useState(transcriptMode === "always" ? sentences.length : 0);

  const effectiveSrc = localSrc ?? src;

  useEffect(() => {
    setRevealed(transcriptMode === "always" ? sentences.length : 0);
  }, [transcriptMode, sentences.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if (!seekRequest || !audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, seekRequest.ms / 1000 - 2);
    void audioRef.current.play();
  }, [seekRequest?.nonce]);

  if (!effectiveSrc) {
    if (externalUrl) {
      return (
        <div className="player" style={{ position: "static" }}>
          <div className="player-row" style={{ flexWrap: "wrap" }}>
            <span className="badge badge-warn">音频外置</span>
            <span className="muted" style={{ fontSize: 13, flex: 1, minWidth: 180 }}>
              音频不随应用分发。可打开原始来源获取，或选择你本地的音频文件。
            </span>
            <button
              className="btn btn-sm"
              onClick={() => window.open(externalUrl, "_blank", "noopener")}
            >
              打开来源
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()}>
              选择本地文件
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setLocalSrc(URL.createObjectURL(file));
                e.target.value = "";
              }}
            />
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            本地文件只在本次会话内使用，不会上传。
          </div>
        </div>
      );
    }
    return (
      <div className="player" style={{ position: "static" }}>
        <div className="player-row">
          <span className="badge badge-warn">无音频</span>
          <span className="muted" style={{ fontSize: 13 }}>
            本材料没有可用音频，已切换为原文训练模式
          </span>
        </div>
      </div>
    );
  }

  const total = durationMs || (audioRef.current?.duration ?? 0) * 1000;
  const activeSentence = sentences.findIndex(
    (s) => currentMs >= s.startMs && currentMs < s.endMs,
  );

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function seek(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(ms / 1000, (audio.duration || total / 1000) - 0.05));
    setCurrentMs(ms);
  }

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={effectiveSrc}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
      />

      <div className="player-row">
        <button className="play-btn" onClick={toggle} aria-label={playing ? "暂停" : "播放"}>
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>

        <div
          className="progress"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            seek(ratio * total);
          }}
        >
          <div
            className="progress-fill"
            style={
              {
                "--p": total > 0 ? Math.min(1, currentMs / total) : 0,
              } as CSSProperties
            }
          />
        </div>

        <span className="time">
          {formatMs(currentMs)} / {formatMs(total)}
        </span>

        <button className="btn btn-ghost btn-sm" onClick={() => seek(currentMs - 15000)}>
          −15s
        </button>

        <div className="rate-group">
          {[0.75, 1, 1.25, 1.5].map((r) => (
            <button
              key={r}
              className={`rate ${rate === r ? "active" : ""}`}
              onClick={() => setRate(r)}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>

      {!compact && sentences.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              听力原文 · 逐句对齐
            </span>
            {transcriptMode === "blind" ? (
              <span className="badge">交卷后可查看</span>
            ) : transcriptMode === "hint" ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setRevealed((n) => Math.min(sentences.length, n + 1))}
              >
                看下一句（{revealed}/{sentences.length}）
              </button>
            ) : null}
          </div>

          {(transcriptMode !== "blind" || revealed > 0) && (
            <div className="transcript">
              {sentences.slice(0, transcriptMode === "always" ? sentences.length : revealed).map((s, i) => (
                <div
                  key={s.id}
                  className={`sent ${activeSentence === i ? "active" : ""}`}
                  onClick={() => seek(s.startMs)}
                >
                  <span className="sent-time">{formatMs(s.startMs)}</span>
                  <span>{s.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
