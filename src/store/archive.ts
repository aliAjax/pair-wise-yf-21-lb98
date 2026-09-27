import type {
  Carpet,
  DamageRegion,
  RegionEvent,
  RegionStatus,
  Rect,
  Scale,
} from "../rules/types";
import { measureRect } from "../rules/measure";

/**
 * 本地存档：只负责 localStorage 的读写与首次演示数据，
 * 不含尺寸规则，也不含页面逻辑。
 */

const STORAGE_KEY = "carpet-repair-assessment-v1";

export function loadArchive(): Carpet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Carpet[];
    }
  } catch {
    // 存档损坏时回退到演示数据
  }
  return seedArchive();
}

export function saveArchive(carpets: Carpet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(carpets));
  } catch {
    // 存储已满或被禁用时静默失败，页面仍可继续使用
  }
}

export function resetArchive(): Carpet[] {
  const seed = seedArchive();
  saveArchive(seed);
  return seed;
}

// —— 以下为首次打开的演示数据 ——

let seedSeq = 0;

interface SeedRegion {
  label: string;
  rect: Rect;
  status: RegionStatus;
  measuredBy?: string;
  measuredAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  startedAt?: string;
  doneAt?: string;
  history: RegionEvent[];
}

function seedRegion(
  input: SeedRegion,
  scale: Scale | null,
  knotDensity: number
): DamageRegion {
  seedSeq += 1;
  const dims =
    scale && input.status !== "pending"
      ? measureRect(input.rect, scale, knotDensity)
      : null;
  return {
    id: `seed-r${seedSeq}`,
    label: input.label,
    rect: input.rect,
    status: input.status,
    dims,
    measuredBy: input.measuredBy ?? null,
    measuredAt: input.measuredAt ?? null,
    reviewedBy: input.reviewedBy ?? null,
    reviewedAt: input.reviewedAt ?? null,
    startedAt: input.startedAt ?? null,
    doneAt: input.doneAt ?? null,
    history: input.history,
  };
}

export function seedArchive(): Carpet[] {
  const scaleA: Scale = {
    warpPxPerCm: 5.2,
    weftPxPerCm: 5.0,
    by: "王建国",
    at: "2026-09-25T09:20:00",
    reason: "初始标定",
  };
  const scaleB: Scale = {
    warpPxPerCm: 4.6,
    weftPxPerCm: 4.6,
    by: "李秀兰",
    at: "2026-09-25T10:05:00",
    reason: "初始标定",
  };
  const scaleD: Scale = {
    warpPxPerCm: 5.0,
    weftPxPerCm: 4.8,
    by: "陈明玉",
    at: "2026-09-26T15:40:00",
    reason: "清洗缩水后复测",
  };

  return [
    {
      id: "CAR-092",
      origin: "波斯",
      era: "约1960s",
      material: "羊毛",
      dye: "植物染",
      knotDensity: 48,
      threadColor: "茜红",
      threadHex: "#b45309",
      note: "边缘磨损待补线",
      seed: 9201,
      palette: ["#7c2d12", "#b45309", "#0f766e", "#e8ddc9"],
      scale: scaleA,
      regions: [
        seedRegion(
          {
            label: "破损区01",
            rect: { x: 44, y: 692, w: 128, h: 96 },
            status: "measured",
            measuredBy: "王建国",
            measuredAt: "2026-09-26T09:12:00",
            history: [
              { at: "2026-09-26T09:12:00", by: "王建国", text: "按标定比例完成测量，尺寸已记录" },
              { at: "2026-09-26T09:10:00", by: "王建国", text: "在纹样图上圈出破损区域" },
            ],
          },
          scaleA,
          48
        ),
        seedRegion(
          {
            label: "破损区02",
            rect: { x: 256, y: 368, w: 132, h: 112 },
            status: "reviewed",
            measuredBy: "王建国",
            measuredAt: "2026-09-26T09:30:00",
            reviewedBy: "李秀兰",
            reviewedAt: "2026-09-26T11:05:00",
            history: [
              { at: "2026-09-26T11:05:00", by: "李秀兰", text: "复核通过，尺寸确认，可以开工" },
              { at: "2026-09-26T09:30:00", by: "王建国", text: "按标定比例完成测量，尺寸已记录" },
              { at: "2026-09-26T09:28:00", by: "王建国", text: "在纹样图上圈出破损区域" },
            ],
          },
          scaleA,
          48
        ),
        seedRegion(
          {
            label: "破损区03",
            rect: { x: 492, y: 64, w: 92, h: 84 },
            status: "done",
            measuredBy: "李秀兰",
            measuredAt: "2026-09-25T10:00:00",
            reviewedBy: "陈明玉",
            reviewedAt: "2026-09-25T10:30:00",
            startedAt: "2026-09-25T13:00:00",
            doneAt: "2026-09-26T17:20:00",
            history: [
              { at: "2026-09-26T17:20:00", by: "李秀兰", text: "完工归档，补线用量已记录" },
              { at: "2026-09-25T13:00:00", by: "李秀兰", text: "开工补线" },
              { at: "2026-09-25T10:30:00", by: "陈明玉", text: "复核通过，尺寸确认，可以开工" },
              { at: "2026-09-25T10:00:00", by: "李秀兰", text: "按标定比例完成测量，尺寸已记录" },
              { at: "2026-09-25T09:58:00", by: "李秀兰", text: "在纹样图上圈出破损区域" },
            ],
          },
          scaleA,
          48
        ),
      ],
    },
    {
      id: "CAR-117",
      origin: "安纳托利亚",
      era: "约1950s",
      material: "羊毛",
      dye: "植物染",
      knotDensity: 42,
      threadColor: "靛蓝",
      threadHex: "#1d4ed8",
      note: "中心纹样缺口",
      seed: 1173,
      palette: ["#1f3a5f", "#c2410c", "#d6a419", "#ece2cd"],
      scale: scaleB,
      regions: [
        seedRegion(
          {
            label: "破损区01",
            rect: { x: 150, y: 240, w: 120, h: 100 },
            status: "repairing",
            measuredBy: "李秀兰",
            measuredAt: "2026-09-26T08:50:00",
            reviewedBy: "王建国",
            reviewedAt: "2026-09-26T09:40:00",
            startedAt: "2026-09-26T14:00:00",
            history: [
              { at: "2026-09-26T14:00:00", by: "李秀兰", text: "开工补线" },
              { at: "2026-09-26T09:40:00", by: "王建国", text: "复核通过，尺寸确认，可以开工" },
              { at: "2026-09-26T08:50:00", by: "李秀兰", text: "按标定比例完成测量，尺寸已记录" },
              { at: "2026-09-26T08:46:00", by: "李秀兰", text: "在纹样图上圈出破损区域" },
            ],
          },
          scaleB,
          42
        ),
        seedRegion(
          {
            label: "破损区02",
            rect: { x: 360, y: 560, w: 110, h: 90 },
            status: "measured",
            measuredBy: "阿依古丽",
            measuredAt: "2026-09-27T09:05:00",
            history: [
              { at: "2026-09-27T09:05:00", by: "阿依古丽", text: "按标定比例完成测量，尺寸已记录" },
              { at: "2026-09-27T09:02:00", by: "阿依古丽", text: "在纹样图上圈出破损区域" },
            ],
          },
          scaleB,
          42
        ),
      ],
    },
    {
      id: "CAR-204",
      origin: "高加索",
      era: "约1970s",
      material: "羊毛",
      dye: "矿物染",
      knotDensity: 36,
      threadColor: "明黄",
      threadHex: "#d97706",
      note: "新收档案，待标定比例",
      seed: 2048,
      palette: ["#7f1d1d", "#1d4ed8", "#d97706", "#f0e6d2"],
      scale: null,
      regions: [
        seedRegion(
          {
            label: "破损区01",
            rect: { x: 220, y: 300, w: 140, h: 120 },
            status: "pending",
            history: [
              { at: "2026-09-27T08:40:00", by: "系统", text: "尚未标定比例，区域记为待测" },
              { at: "2026-09-27T08:38:00", by: "赵铁柱", text: "在纹样图上圈出破损区域" },
            ],
          },
          null,
          36
        ),
      ],
    },
    {
      id: "CAR-138",
      origin: "藏毯",
      era: "约1980s",
      material: "藏羊毛",
      dye: "植物染",
      knotDensity: 30,
      threadColor: "靛蓝",
      threadHex: "#1e40af",
      note: "清洗后缩水，局部暂停",
      seed: 1380,
      palette: ["#0f3d3e", "#c2410c", "#ca8a04", "#e6dcc6"],
      scale: scaleD,
      regions: [
        seedRegion(
          {
            label: "破损区01",
            rect: { x: 180, y: 420, w: 130, h: 110 },
            status: "paused",
            measuredBy: "王建国",
            measuredAt: "2026-09-25T15:00:00",
            reviewedBy: "李秀兰",
            reviewedAt: "2026-09-25T16:20:00",
            history: [
              { at: "2026-09-26T15:40:00", by: "系统", text: "比例变更（清洗缩水后复测），已复核未开工，暂停补线" },
              { at: "2026-09-25T16:20:00", by: "李秀兰", text: "复核通过，尺寸确认，可以开工" },
              { at: "2026-09-25T15:00:00", by: "王建国", text: "按标定比例完成测量，尺寸已记录" },
              { at: "2026-09-25T14:56:00", by: "王建国", text: "在纹样图上圈出破损区域" },
            ],
          },
          scaleD,
          30
        ),
        seedRegion(
          {
            label: "破损区02",
            rect: { x: 420, y: 180, w: 100, h: 86 },
            status: "measured",
            measuredBy: "阿依古丽",
            measuredAt: "2026-09-27T08:20:00",
            history: [
              { at: "2026-09-27T08:20:00", by: "阿依古丽", text: "按标定比例完成测量，尺寸已记录" },
              { at: "2026-09-27T08:17:00", by: "阿依古丽", text: "在纹样图上圈出破损区域" },
            ],
          },
          scaleD,
          30
        ),
      ],
    },
  ];
}
