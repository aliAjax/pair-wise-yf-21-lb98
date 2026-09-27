/**
 * 本地存档层：只负责档案数据的序列化与 localStorage 读写，
 * 不包含尺寸规则，也不依赖 React。页面层通过 state hook 间接调用。
 */
import {
  measureRect,
  type Region,
  type Scale,
  type ScaleEvent,
} from "../rules/measurement";

export interface PatternImage {
  /** 纹样图（内置为 SVG data URL，也支持页面导入的图片 data URL） */
  url: string;
  /** 纹样图原始像素尺寸，圈选坐标以该尺寸为基准 */
  width: number;
  height: number;
}

export interface Carpet {
  id: string;
  origin: string;
  era: string;
  knotDensity: string;
  material: string;
  dyeType: string;
  pattern: PatternImage;
  /** 当前生效的经/纬每厘米像素值；未录入时为 null，不能定损 */
  scale: Scale | null;
  scaleHistory: ScaleEvent[];
  regions: Region[];
  createdAt: string;
}

export interface ArchiveData {
  version: number;
  carpets: Carpet[];
}

const STORAGE_KEY = "carpet-repair-archive:v1";
export const ARCHIVE_VERSION = 1;

/* ----------------------------- 存档读写 ----------------------------- */

export function loadArchive(): ArchiveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = seedArchive();
      saveArchive(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as ArchiveData;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.carpets)) {
      throw new Error("档案结构损坏");
    }
    return migrate(parsed);
  } catch (err) {
    console.warn("本地档案读取失败，回退到示例档案：", err);
    return seedArchive();
  }
}

export function saveArchive(data: ArchiveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("档案保存失败（可能是存储空间不足）：", err);
    throw err;
  }
}

export function resetArchive(): ArchiveData {
  const seed = seedArchive();
  saveArchive(seed);
  return seed;
}

/** 未来版本升级时在这里做数据迁移；当前只有 v1 */
function migrate(data: ArchiveData): ArchiveData {
  if (data.version === ARCHIVE_VERSION) return data;
  return data;
}

/* ----------------------------- 编号 / ID ----------------------------- */

export function nextCarpetId(carpets: Carpet[]): string {
  let max = 0;
  for (const c of carpets) {
    const n = Number(c.id.replace(/^CAR-/, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `CAR-${String(max + 1).padStart(3, "0")}`;
}

export function newRegionId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ----------------------------- 示例纹样 ----------------------------- */

const PATTERN_W = 1000;
const PATTERN_H = 700;

function patternSvg(bg: string, border: string, accent: string, motif: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PATTERN_W}" height="${PATTERN_H}" viewBox="0 0 1000 700">
  <rect width="1000" height="700" fill="${bg}"/>
  <rect x="24" y="24" width="952" height="652" fill="none" stroke="${border}" stroke-width="18"/>
  <rect x="58" y="58" width="884" height="584" fill="none" stroke="${border}" stroke-width="5" stroke-dasharray="14 10"/>
  <ellipse cx="500" cy="350" rx="220" ry="150" fill="none" stroke="${accent}" stroke-width="7"/>
  <ellipse cx="500" cy="350" rx="150" ry="96" fill="none" stroke="${accent}" stroke-width="4"/>
  <path d="${motif}" fill="none" stroke="${border}" stroke-width="6"/>
  <circle cx="500" cy="350" r="26" fill="${accent}"/>
  <circle cx="180" cy="160" r="34" fill="none" stroke="${accent}" stroke-width="5"/>
  <circle cx="820" cy="160" r="34" fill="none" stroke="${accent}" stroke-width="5"/>
  <circle cx="180" cy="540" r="34" fill="none" stroke="${accent}" stroke-width="5"/>
  <circle cx="820" cy="540" r="34" fill="none" stroke="${accent}" stroke-width="5"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PATTERNS = {
  persian: patternSvg(
    "#8f2f1e",
    "#e7c98f",
    "#1d6b63",
    "M330 350 C400 250 600 250 670 350 C600 450 400 450 330 350 Z",
  ),
  anatolian: patternSvg(
    "#b4471f",
    "#f2dfae",
    "#1c5f8c",
    "M500 210 L610 350 L500 490 L390 350 Z",
  ),
  tibetan: patternSvg(
    "#5b3a78",
    "#d9b46a",
    "#2f8f6b",
    "M500 230 C560 300 560 400 500 470 C440 400 440 300 500 230 Z",
  ),
};

/* ----------------------------- 示例档案 ----------------------------- */

interface SeedRegion {
  label: string;
  rect: Region["rect"];
  status: Region["status"];
  measuredBy?: string;
  reviewedBy?: string;
  yarnColor?: string;
  note?: string;
}

function buildSeedRegion(
  seq: number,
  spec: SeedRegion,
  scale: Scale,
  dates: Record<string, string>,
): Region {
  const base: Region = {
    id: `seed-${seq}`,
    index: seq,
    label: spec.label,
    rect: spec.rect,
    status: "pending",
    measurement: null,
    staleMeasurement: null,
    reviewedBy: null,
    reviewedAt: null,
    startedAt: null,
    completedAt: null,
    invalidationCount: 0,
    yarnColor: spec.yarnColor ?? "",
    note: spec.note ?? "",
    history: [{ at: dates.created, kind: "created", by: "档案员" }],
  };

  if (spec.status === "pending") return base;

  const dims = measureRect(spec.rect, scale);
  const measured: Region = {
    ...base,
    status: "measured",
    measurement: {
      ...dims,
      scale: { ...scale },
      measuredBy: spec.measuredBy ?? "李纹",
      measuredAt: dates.measured,
    },
    history: [
      ...base.history,
      { at: dates.measured, kind: "measured", by: spec.measuredBy ?? "李纹" },
    ],
  };

  if (spec.status === "measured") return measured;

  const reviewed: Region = {
    ...measured,
    status: "reviewed",
    reviewedBy: spec.reviewedBy ?? "王朴",
    reviewedAt: dates.reviewed,
    history: [
      ...measured.history,
      { at: dates.reviewed, kind: "reviewed", by: spec.reviewedBy ?? "王朴" },
    ],
  };
  if (spec.status === "reviewed") return reviewed;

  const active: Region = {
    ...reviewed,
    status: "active",
    startedAt: dates.started,
    history: [...reviewed.history, { at: dates.started, kind: "started", by: "赵织" }],
  };
  if (spec.status === "active") return active;

  return {
    ...active,
    status: "done",
    completedAt: dates.completed,
    history: [...active.history, { at: dates.completed, kind: "completed", by: "赵织" }],
  };
}

function seedArchive(): ArchiveData {
  const scaleA: Scale = { pxPerCmX: 9.6, pxPerCmY: 10.4 };
  const scaleB: Scale = { pxPerCmX: 11.2, pxPerCmY: 11.5 };

  const d = (day: number) => `2026-09-${String(day).padStart(2, "0")}T09:00:00.000Z`;

  const mkScaleHistory = (scale: Scale, day: number, by: string): ScaleEvent[] => [
    { at: d(day), ...scale, source: "initial", by },
  ];

  const carpets: Carpet[] = [
    {
      id: "CAR-092",
      origin: "波斯",
      era: "约1960s",
      knotDensity: "38 结/平方英寸",
      material: "羊毛",
      dyeType: "植物染",
      pattern: { url: PATTERNS.persian, width: PATTERN_W, height: PATTERN_H },
      scale: scaleA,
      scaleHistory: mkScaleHistory(scaleA, 2, "李纹"),
      createdAt: d(1),
      regions: [
        buildSeedRegion(
          1,
          {
            label: "左边缘磨损",
            rect: { x: 70, y: 300, width: 96, height: 150 },
            status: "done",
            measuredBy: "李纹",
            reviewedBy: "王朴",
            yarnColor: "色卡 P-14 赭红",
            note: "边缘磨损待补线，已完工存档",
          },
          scaleA,
          {
            created: d(2),
            measured: d(3),
            reviewed: d(4),
            started: d(5),
            completed: d(12),
          },
        ),
        buildSeedRegion(
          2,
          {
            label: "右上角虫蛀",
            rect: { x: 742, y: 86, width: 128, height: 96 },
            status: "reviewed",
            measuredBy: "李纹",
            reviewedBy: "陈静",
            yarnColor: "色卡 P-07 土金",
            note: "等待排期开工",
          },
          scaleA,
          { created: d(10), measured: d(11), reviewed: d(12) },
        ),
        buildSeedRegion(
          3,
          {
            label: "中心纹缺口",
            rect: { x: 430, y: 300, width: 140, height: 100 },
            status: "measured",
            measuredBy: "李纹",
            yarnColor: "",
            note: "尺寸刚算完，等第二名师傅复核",
          },
          scaleA,
          { created: d(15), measured: d(16) },
        ),
      ],
    },
    {
      id: "CAR-117",
      origin: "安纳托利亚",
      era: "约1980s",
      knotDensity: "42 结/平方英寸",
      material: "羊毛",
      dyeType: "植物染",
      pattern: { url: PATTERNS.anatolian, width: PATTERN_W, height: PATTERN_H },
      scale: scaleB,
      scaleHistory: mkScaleHistory(scaleB, 8, "王朴"),
      createdAt: d(6),
      regions: [
        buildSeedRegion(
          1,
          {
            label: "中心纹样缺口",
            rect: { x: 452, y: 296, width: 96, height: 108 },
            status: "pending",
            note: "已圈出，待录入尺寸",
          },
          scaleB,
          { created: d(14) },
        ),
      ],
    },
    {
      id: "CAR-138",
      origin: "藏毯",
      era: "年代不详",
      knotDensity: "待估",
      material: "羊毛",
      dyeType: "局部褪色",
      pattern: { url: PATTERNS.tibetan, width: PATTERN_W, height: PATTERN_H },
      scale: null,
      scaleHistory: [],
      createdAt: d(13),
      regions: [],
    },
  ];

  return { version: ARCHIVE_VERSION, carpets };
}
