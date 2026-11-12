import type { ExamConfig, Manifest, Pack } from "@cetnova/schema";
const BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

const cache = new Map<string, Promise<unknown>>();
let contentVersion = "0";

function getJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`加载失败：${path} (${res.status})`);
        return res.json();
      }),
    );
  }
  return cache.get(url) as Promise<T>;
}

export async function loadManifest(): Promise<Manifest> {
  // 题库索引必须回源，否则内容更新后用户会一直看到旧包
  const url = `${BASE}content/manifest.json`;
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`加载失败：manifest.json (${res.status})`);
  const manifest = (await res.json()) as Manifest;
  contentVersion = manifest.updatedAt ?? "0";
  return manifest;
}

export function loadExam(examId: string): Promise<ExamConfig> {
  return getJson<ExamConfig>(`content/exams/${examId}.json`);
}

export function loadPack(path: string): Promise<Pack> {
  return getJson<Pack>(`content/${path}?v=${encodeURIComponent(contentVersion)}`);
}

export function assetUrl(pack: Pack, assetId?: string): string | null {
  if (!assetId) return null;
  const asset = pack.assets.find((a) => a.assetId === assetId);
  if (!asset?.distribution.url) return null;
  if (asset.distribution.state === "bundled") {
    return `${BASE}content/${asset.distribution.url}`;
  }
  return asset.distribution.url;
}

export interface AudioSource {
  src: string | null;
  externalUrl: string | null;
  state: "bundled" | "external" | "user_provided" | "unavailable";
}

/** external 资产不自动播放，交给用户选择来源或本地文件 */
export function audioSource(pack: Pack, assetId?: string): AudioSource {
  const asset = pack.assets.find((a) => a.assetId === assetId);
  if (!asset?.distribution.url) {
    return { src: null, externalUrl: null, state: "unavailable" };
  }
  if (asset.distribution.state === "bundled") {
    return {
      src: `${BASE}content/${asset.distribution.url}`,
      externalUrl: null,
      state: "bundled",
    };
  }
  return {
    src: null,
    externalUrl: asset.distribution.url,
    state: asset.distribution.state,
  };
}

export const SECTION_LABEL: Record<string, string> = {
  listening: "听力",
  reading: "阅读",
  writing: "写作",
  translation: "翻译",
};

export const PART_LABEL: Record<string, string> = {
  "listening.p1": "长对话",
  "listening.p2": "听力篇章",
  "listening.p3": "讲座/讲话",
  "reading.p1": "选词填空",
  "reading.p2": "长篇阅读",
  "reading.p3": "仔细阅读",
  translation: "汉译英",
  writing: "写作",
};

export function partLabel(part: string): string {
  return PART_LABEL[part] ?? part;
}
