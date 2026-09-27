/**
 * 尺寸规则层（纯函数，不依赖 DOM / localStorage / React）
 *
 * 术语：
 * - 经向（warp）：地毯经线方向，纹样图上对应竖直方向（rect.y / rect.height）。
 * - 纬向（weft）：地毯纬线方向，纹样图上对应水平方向（rect.x / rect.width）。
 * 由于手工地毯经、纬两个方向的密度不同，清洗缩水后也可能不同步，
 * 因此两个方向必须分别录入「每厘米像素值 px/cm」。
 *
 * 所有长度单位：厘米（cm），保留 1 位小数；面积：平方厘米（cm²）。
 */

export type RegionStatus =
  | "pending" // 待测：已圈出区域，还没有尺寸
  | "measured" // 已测：尺寸已算出，等待第二名师傅复核
  | "reviewed" // 已复核：复核通过，可以裁补线（尚未开工）
  | "active" // 已开工：补线进行中
  | "done" // 已完工
  | "paused"; // 暂停：缩水后，已复核但未开工的区域挂起，需按新比例重新复核

export const STATUS_ORDER: RegionStatus[] = [
  "pending",
  "measured",
  "reviewed",
  "active",
  "done",
  "paused",
];

export const STATUS_LABEL: Record<RegionStatus, string> = {
  pending: "待测",
  measured: "已测待复核",
  reviewed: "已复核",
  active: "补线中",
  done: "已完工",
  paused: "暂停（缩水待重核）",
};

/** 状态色板，供页面层使用（规则层不渲染，但色值属于业务约定，集中维护） */
export const STATUS_COLOR: Record<RegionStatus, string> = {
  pending: "#94a3b8",
  measured: "#b45309",
  reviewed: "#0f766e",
  active: "#7c2d12",
  done: "#334155",
  paused: "#dc2626",
};

/** 纹样图原始像素坐标系下的矩形（x/y 为左上角） */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Scale {
  /** 纬向：水平方向每厘米像素数 */
  pxPerCmX: number;
  /** 经向：竖直方向每厘米像素数 */
  pxPerCmY: number;
}

export type ScaleSource = "initial" | "shrink";

export interface ScaleEvent {
  at: string;
  pxPerCmX: number;
  pxPerCmY: number;
  source: ScaleSource;
  by: string;
  note?: string;
}

/** 区域在某一比例下测得的尺寸快照 */
export interface MeasureSnapshot {
  /** 纬向长度（cm） */
  widthCm: number;
  /** 经向长度（cm） */
  lengthCm: number;
  /** 面积（cm²） */
  areaCm2: number;
  /** 周长（cm） */
  perimeterCm: number;
  /** 所需补线长度（cm），规则见 YARN 常量 */
  yarnCm: number;
  scale: Scale;
  measuredBy: string;
  measuredAt: string;
}

export type HistoryKind =
  | "created"
  | "measured"
  | "reviewed"
  | "rejected"
  | "started"
  | "completed"
  | "invalidated"
  | "paused"
  | "resumed"
  | "rescaled"
  | "deleted";

export interface HistoryEntry {
  at: string;
  kind: HistoryKind;
  by: string;
  note?: string;
}

export interface Region {
  id: string;
  index: number;
  label: string;
  rect: Rect;
  status: RegionStatus;
  /** 当前有效的测量快照；待测 / 失效后为 null */
  measurement: MeasureSnapshot | null;
  /** 暂停区域保留的旧尺寸，仅供页面对照，重测后清空 */
  staleMeasurement: MeasureSnapshot | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** 缩水失效次数 */
  invalidationCount: number;
  /** 计划使用的补线颜色（色卡编号/名称），不参与尺寸计算 */
  yarnColor: string;
  note: string;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* 尺寸规则参数（与页面、存档分开维护，改这里即可调整核算口径）          */
/* ------------------------------------------------------------------ */

export const MEASUREMENT_RULES = {
  minPxPerCm: 0.1,
  maxPxPerCm: 10000,
  /** 圈选矩形单边最小像素，避免误点产生的碎区域 */
  minRectPx: 8,
  /** 数值保留小数位 */
  precision: 1,
  /**
   * 补线长度 = 周长 × 包边系数 + 面积 × 单位面积耗线系数
   * 默认值为工作室经验值：
   * - 破损轮廓走针按周长计，每厘米轮廓折算 2 cm 线（来回针）；
   * - 每平方厘米补织平均耗线 6 cm（按常见结密度估算）。
   */
  yarnPerimeterFactor: 2,
  yarnPerAreaFactor: 6,
} as const;

export function round1(n: number): number {
  const p = 10 ** MEASUREMENT_RULES.precision;
  return Math.round(n * p) / p;
}

export function isValidScaleValue(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= MEASUREMENT_RULES.minPxPerCm &&
    v <= MEASUREMENT_RULES.maxPxPerCm
  );
}

export function validateScale(scale: Partial<Scale>): Scale {
  if (!isValidScaleValue(scale.pxPerCmX)) {
    throw new Error("纬向（水平）每厘米像素值需为大于 0 的数字");
  }
  if (!isValidScaleValue(scale.pxPerCmY)) {
    throw new Error("经向（竖直）每厘米像素值需为大于 0 的数字");
  }
  return { pxPerCmX: scale.pxPerCmX, pxPerCmY: scale.pxPerCmY };
}

/** 圈选矩形归一化（允许从右下往左上拖），并校验最小尺寸 */
export function normalizeRect(a: Rect, imageWidth: number, imageHeight: number): Rect {
  const x1 = Math.min(Math.max(a.x, 0), imageWidth);
  const y1 = Math.min(Math.max(a.y, 0), imageHeight);
  const x2 = Math.min(Math.max(a.x + a.width, 0), imageWidth);
  const y2 = Math.min(Math.max(a.y + a.height, 0), imageHeight);
  const rect = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
  if (rect.width < MEASUREMENT_RULES.minRectPx || rect.height < MEASUREMENT_RULES.minRectPx) {
    throw new Error(
      `圈选区域过小，经、纬方向至少各 ${MEASUREMENT_RULES.minRectPx} 像素，请重新圈选`,
    );
  }
  return rect;
}

/**
 * 由纹样图像素矩形与经/纬像素比例计算实际尺寸。
 * 纬向长度 = 水平像素 / pxPerCmX；经向长度 = 竖直像素 / pxPerCmY。
 */
export function measureRect(rect: Rect, scale: Scale): {
  widthCm: number;
  lengthCm: number;
  areaCm2: number;
  perimeterCm: number;
  yarnCm: number;
} {
  validateScale(scale);
  const widthCm = round1(rect.width / scale.pxPerCmX);
  const lengthCm = round1(rect.height / scale.pxPerCmY);
  const areaCm2 = round1(widthCm * lengthCm);
  const perimeterCm = round1(2 * (widthCm + lengthCm));
  const yarnCm = round1(
    perimeterCm * MEASUREMENT_RULES.yarnPerimeterFactor +
      areaCm2 * MEASUREMENT_RULES.yarnPerAreaFactor,
  );
  return { widthCm, lengthCm, areaCm2, perimeterCm, yarnCm };
}

/* ------------------------------------------------------------------ */
/* 人员规则                                                            */
/* ------------------------------------------------------------------ */

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * 进入补线前必须由另一名师傅复核：复核人不得与测量人为同一人，
 * 也不得与圈选/录入人（记录在 measuredBy）为同一人。
 */
export function assertDifferentPerson(reviewer: string, other: string, label: string): void {
  const r = normalizeName(reviewer);
  if (!r) throw new Error("请填写复核师傅姓名");
  if (r === normalizeName(other)) {
    throw new Error(`复核人不能与${label}（${other}）是同一人，请换另一名师傅复核`);
  }
}

/* ------------------------------------------------------------------ */
/* 区域状态流转（全部返回新对象，保持不可变）                            */
/* ------------------------------------------------------------------ */

let clock: () => string = () => new Date().toISOString();
/** 供测试注入固定时间 */
export function __setClock(fn: () => string): void {
  clock = fn;
}
export function now(): string {
  return clock();
}

function push(region: Region, entry: Omit<HistoryEntry, "at">): HistoryEntry[] {
  return [...region.history, { ...entry, at: now() }];
}

export function canMeasure(region: Region): boolean {
  // 待测、已测待复核、缩水暂停后重新测量，都允许提交尺寸
  return region.status === "pending" || region.status === "measured" || region.status === "paused";
}

export function canReview(region: Region): boolean {
  return region.status === "measured";
}

export function canStart(region: Region): boolean {
  return region.status === "reviewed";
}

export function canDelete(region: Region): boolean {
  // 已完工记录必须保留；补线中的区域也不允许直接删除
  return region.status !== "done" && region.status !== "active";
}

/**
 * 提交 / 重新提交测量结果。
 * 规则：仅 pending / measured / paused 状态可测；测量后一律进入 measured（等待他人复核）。
 */
export function submitMeasurement(
  region: Region,
  scale: Scale,
  measuredBy: string,
): Region {
  const name = normalizeName(measuredBy);
  if (!name) throw new Error("请填写测量师傅姓名");
  if (!canMeasure(region)) {
    throw new Error("该区域已复核或已完工，不能重新测量");
  }
  validateScale(scale);
  const dims = measureRect(region.rect, scale);
  const snapshot: MeasureSnapshot = {
    ...dims,
    scale: { ...scale },
    measuredBy: name,
    measuredAt: now(),
  };
  return {
    ...region,
    status: "measured",
    measurement: snapshot,
    staleMeasurement: null,
    reviewedBy: null,
    reviewedAt: null,
    history: push(region, { kind: "measured", by: name }),
  };
}

/**
 * 第二名师傅复核尺寸。
 * 规则：必须是 measured 状态；复核人不得与测量人相同。
 */
export function approveReview(region: Region, reviewer: string): Region {
  const name = normalizeName(reviewer);
  if (!canReview(region) || !region.measurement) {
    throw new Error("只有「已测待复核」的区域可以复核");
  }
  assertDifferentPerson(name, region.measurement.measuredBy, "测量人");
  return {
    ...region,
    status: "reviewed",
    reviewedBy: name,
    reviewedAt: now(),
    history: push(region, { kind: "reviewed", by: name }),
  };
}

/** 复核发现尺寸有误：退回待测（测量快照保留与否由页面决定，这里清空待重测） */
export function rejectReview(region: Region, reviewer: string): Region {
  const name = normalizeName(reviewer);
  if (!name) throw new Error("请填写复核师傅姓名");
  if (!canReview(region) || !region.measurement) {
    throw new Error("只有「已测待复核」的区域可以退回");
  }
  return {
    ...region,
    status: "pending",
    measurement: null,
    history: push(region, { kind: "rejected", by: name, note: "复核退回待测" }),
  };
}

/** 开工补线（复核通过后方可） */
export function startRepair(region: Region, by: string): Region {
  const name = normalizeName(by);
  if (!name) throw new Error("请填写开工师傅姓名");
  if (!canStart(region)) {
    throw new Error("必须经另一名师傅复核通过后才能开工补线");
  }
  return {
    ...region,
    status: "active",
    startedAt: now(),
    history: push(region, { kind: "started", by: name }),
  };
}

export function completeRepair(region: Region, by: string): Region {
  const name = normalizeName(by);
  if (!name) throw new Error("请填写完工登记人姓名");
  if (region.status !== "active") {
    throw new Error("只有补线中的区域可以登记完工");
  }
  return {
    ...region,
    status: "done",
    completedAt: now(),
    history: push(region, { kind: "completed", by: name }),
  };
}

/* ------------------------------------------------------------------ */
/* 缩水 / 重新定标规则                                                   */
/* ------------------------------------------------------------------ */

export interface RescaleResult {
  regions: Region[];
  invalidated: string[];
  paused: string[];
  untouched: string[];
}

/**
 * 清洗后地毯缩水、比例发生变化时，对一张地毯下所有区域执行：
 *
 * - 未复核（pending / measured）：尺寸标记失效，退回「待测」，
 *   清空测量快照与复核信息，保留圈选框以便按新比例重测；
 * - 已复核但未开工（reviewed）：转为「暂停」，旧尺寸仅作对照保留，
 *   重新测量并复核后方可继续；
 * - 已开工（active）：保持原状（已在织物上的补线不受档案比例变更影响）；
 * - 已完工（done）：完工记录原样保留。
 *
 * 新比例与传入的当前比例完全相同时，视为比例未变化，拒绝生成失效记录。
 */
export function applyRescale(
  regions: Region[],
  oldScale: Scale | null,
  newScale: Scale,
  by: string,
): RescaleResult {
  const name = normalizeName(by);
  if (!name) throw new Error("请登记执行缩水定标的师傅姓名");
  validateScale(newScale);
  if (
    oldScale &&
    round1(oldScale.pxPerCmX) === round1(newScale.pxPerCmX) &&
    round1(oldScale.pxPerCmY) === round1(newScale.pxPerCmY)
  ) {
    throw new Error("新比例与当前比例相同，无需作废尺寸标记");
  }

  const invalidated: string[] = [];
  const paused: string[] = [];
  const untouched: string[] = [];

  const next = regions.map((region) => {
    switch (region.status) {
      case "pending":
      case "measured": {
        invalidated.push(region.id);
        return {
          ...region,
          status: "pending" as RegionStatus,
          measurement: null,
          staleMeasurement: null,
          reviewedBy: null,
          reviewedAt: null,
          invalidationCount: region.invalidationCount + 1,
          history: push(region, {
            kind: "invalidated" as const,
            by: name,
            note: "清洗缩水，尺寸标记失效，退回待测",
          }),
        };
      }
      case "reviewed": {
        paused.push(region.id);
        return {
          ...region,
          status: "paused" as RegionStatus,
          measurement: null,
          staleMeasurement: region.measurement,
          invalidationCount: region.invalidationCount + 1,
          history: push(region, {
            kind: "paused" as const,
            by: name,
            note: "清洗缩水，已复核未开工区域暂停，待按新比例重测复核",
          }),
        };
      }
      case "paused": {
        // 连续两次缩水：保持暂停，刷新旧尺寸对照与计数
        paused.push(region.id);
        return {
          ...region,
          invalidationCount: region.invalidationCount + 1,
          history: push(region, {
            kind: "paused" as const,
            by: name,
            note: "再次缩水登记，仍需按最新比例重测复核",
          }),
        };
      }
      case "active":
      case "done":
      default:
        untouched.push(region.id);
        return region;
    }
  });

  return { regions: next, invalidated, paused, untouched };
}

/**
 * 暂停区域按新比例重新测量后，仍需走 measured → reviewed 流程；
 * submitMeasurement 已覆盖 paused → measured 的转换，这里提供显式语义入口。
 */
export function resumeForRemeasure(region: Region, by: string): Region {
  const name = normalizeName(by);
  if (!name) throw new Error("请填写师傅姓名");
  if (region.status !== "paused") {
    throw new Error("只有暂停的区域需要申请重测");
  }
  return {
    ...region,
    // 仍为 paused，直到新尺寸经另一名师傅复核；页面上重测提交后会进入 measured
    staleMeasurement: region.staleMeasurement,
    history: push(region, { kind: "resumed", by: name, note: "按缩水后新比例重测" }),
  };
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

export interface RegionSummary {
  total: number;
  byStatus: Record<RegionStatus, number>;
  /** 当前仍有效（已复核/补线中/完工）尺寸对应的补线总长度 cm */
  yarnTotalCm: number;
  /** 已完工区域数占比 0–1 */
  doneRate: number;
}

export function summarizeRegions(regions: Region[]): RegionSummary {
  const byStatus = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, 0]),
  ) as Record<RegionStatus, number>;
  let yarnTotalCm = 0;
  for (const r of regions) {
    byStatus[r.status] += 1;
    if (r.measurement && (r.status === "reviewed" || r.status === "active" || r.status === "done")) {
      yarnTotalCm += r.measurement.yarnCm;
    }
  }
  return {
    total: regions.length,
    byStatus,
    yarnTotalCm: round1(yarnTotalCm),
    doneRate: regions.length ? byStatus.done / regions.length : 0,
  };
}
