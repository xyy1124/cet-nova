export interface DictEntry {
  pos: string;
  zh: string;
  note?: string;
  phonetic?: string;
}

type CoreEntry = { p: string; pos: string; zh: string };

const DEMO_DICT: Record<string, DictEntry> = {
  privilege: { pos: "n.", zh: "特权；荣幸" },
  arrangement: { pos: "n.", zh: "安排；布置" },
  commuting: { pos: "n.", zh: "通勤", note: "commute v. 通勤" },
  isolation: { pos: "n.", zh: "孤立；隔绝" },
  informal: { pos: "adj.", zh: "非正式的" },
  outweigh: { pos: "v.", zh: "比…更重要；胜过" },
  disputed: { pos: "adj.", zh: "有争议的", note: "dispute n./v. 争论" },
  settled: { pos: "adj.", zh: "已确定的；稳定的" },
  however: { pos: "adv.", zh: "然而；不过" },
  therefore: { pos: "adv.", zh: "因此" },
  notebook: { pos: "n.", zh: "笔记本" },
  tablet: { pos: "n.", zh: "平板电脑；药片" },
  efficiency: { pos: "n.", zh: "效率" },
  handwriting: { pos: "n.", zh: "手写；笔迹" },
  summarise: { pos: "v.", zh: "概括；总结" },
  harmful: { pos: "adj.", zh: "有害的" },
  copying: { pos: "n.", zh: "抄写；复制" },
  attention: { pos: "n.", zh: "注意力" },
  courier: { pos: "n.", zh: "快递员；信使" },
  delivery: { pos: "n.", zh: "递送；交付" },
  convenience: { pos: "n.", zh: "便利" },
  platform: { pos: "n.", zh: "平台" },
  packaging: { pos: "n.", zh: "包装" },
  landfill: { pos: "n.", zh: "垃圾填埋场" },
  receipt: { pos: "n.", zh: "收据；小票" },
  externality: { pos: "n.", zh: "外部性（经济学）", note: "由第三方承担的成本" },
  invisible: { pos: "adj.", zh: "看不见的" },
  disclose: { pos: "v.", zh: "披露；公开" },
  disclosure: { pos: "n.", zh: "披露；公开" },
  behaviour: { pos: "n.", zh: "行为", note: "美式 behavior" },
  visible: { pos: "adj.", zh: "可见的" },
  sample: { pos: "n.", zh: "样本；样品" },
  conclusive: { pos: "adj.", zh: "决定性的；确凿的" },
  recall: { pos: "v.", zh: "回忆起；召回" },
  cram: { pos: "v.", zh: "临时抱佛脚；塞满" },
  nap: { pos: "n.", zh: "小睡" },
  stage: { pos: "n.", zh: "阶段；舞台" },
  passive: { pos: "adj.", zh: "被动的" },
  shutdown: { pos: "n.", zh: "关闭；停运" },
  remarkably: { pos: "adv.", zh: "显著地；非常" },
  experiment: { pos: "n.", zh: "实验" },
  reduce: { pos: "v.", zh: "减少" },
  retain: { pos: "v.", zh: "保留；记住" },
  memory: { pos: "n.", zh: "记忆" },
  majority: { pos: "n.", zh: "多数" },
  significant: { pos: "adj.", zh: "显著的；重要的" },
  barrier: { pos: "n.", zh: "障碍" },
  adopt: { pos: "v.", zh: "采用；收养" },
  policy: { pos: "n.", zh: "政策" },
  remote: { pos: "adj.", zh: "远程的；偏远的" },
  employee: { pos: "n.", zh: "雇员" },
  critic: { pos: "n.", zh: "批评者" },
  weaken: { pos: "v.", zh: "削弱" },
  teamwork: { pos: "n.", zh: "团队协作" },
  schedule: { pos: "n.", zh: "日程安排" },
  benefits: { pos: "n.", zh: "益处", note: "benefit 的复数" },
  cost: { pos: "n.", zh: "成本；代价" },
  question: { pos: "n.", zh: "问题" },
  deliver: { pos: "v.", zh: "递送；发表" },
  income: { pos: "n.", zh: "收入" },
  speed: { pos: "n.", zh: "速度" },
  care: { pos: "n.", zh: "照料；谨慎" },
  surrender: { pos: "v.", zh: "交出；投降" },
  percent: { pos: "n.", zh: "百分比" },
  order: { pos: "n.", zh: "订单；顺序" },
  waste: { pos: "n.", zh: "废弃物；浪费" },
  customer: { pos: "n.", zh: "顾客" },
  rating: { pos: "n.", zh: "评分；评级" },
  wage: { pos: "n.", zh: "工资" },
  require: { pos: "v.", zh: "要求；需要" },
  city: { pos: "n.", zh: "城市" },
  unclear: { pos: "adj.", zh: "不清楚的" },
  hidden: { pos: "adj.", zh: "隐藏的" },
  mobile: { pos: "adj.", zh: "移动的" },
  payment: { pos: "n.", zh: "支付" },
  economy: { pos: "n.", zh: "经济" },
  digital: { pos: "adj.", zh: "数字的" },
  habit: { pos: "n.", zh: "习惯" },
  transport: { pos: "n.", zh: "交通；运输" },
  utility: { pos: "n.", zh: "公用事业；效用" },
  bill: { pos: "n.", zh: "账单" },
  countryside: { pos: "n.", zh: "乡村" },
  adoption: { pos: "n.", zh: "采用；普及" },
};

const SUFFIXES = ["ies", "es", "s", "ed", "ing", "ly"];

/** 核心词库按需加载，避免把 200KB 词典塞进首屏 chunk */
let CORE: Record<string, DictEntry> | null = null;
let loadPromise: Promise<void> | null = null;

export function loadCoreDict(): Promise<void> {
  if (CORE) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = import("./dict-data.json").then((mod) => {
      const raw = mod.default as Record<string, CoreEntry>;
      const map: Record<string, DictEntry> = {};
      for (const [word, entry] of Object.entries(raw)) {
        map[word] = { pos: entry.pos, zh: entry.zh, phonetic: entry.p };
      }
      CORE = map;
    });
  }
  return loadPromise;
}

export function dictSize(): number {
  return Object.keys(DEMO_DICT).length + (CORE ? Object.keys(CORE).length : 0);
}

export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .trim();
}

export function lookupWord(raw: string): { word: string; entry: DictEntry } | null {
  const word = normalizeWord(raw);
  if (!word || word.length > 32) return null;
  const direct = DEMO_DICT[word] ?? CORE?.[word];
  if (direct) return { word, entry: direct };
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length > suffix.length + 2) {
      const stem = word.slice(0, -suffix.length);
      const stemEntry = DEMO_DICT[stem] ?? CORE?.[stem];
      if (stemEntry) return { word: stem, entry: stemEntry };
    }
  }
  return null;
}
