/** 图像像素坐标 */
export interface Point {
  x: number;
  y: number;
}

/** 纹样图上的像素矩形 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 比例标定：经纬方向每厘米对应的像素值 */
export interface Scale {
  /** 经向（纹样图纵向）每厘米像素 */
  warpPxPerCm: number;
  /** 纬向（纹样图横向）每厘米像素 */
  weftPxPerCm: number;
  /** 标定人 */
  by: string;
  /** 标定时间 ISO */
  at: string;
  /** 标定原因：初始标定 / 清洗缩水后复测 / 例行校准 */
  reason: string;
}

/** 由比例换算出的真实尺寸 */
export interface Dimensions {
  /** 宽（纬向，厘米） */
  widthCm: number;
  /** 长（经向，厘米） */
  heightCm: number;
  areaCm2: number;
  /** 所需补线长度（米） */
  threadM: number;
}

/**
 * 区域状态流转：
 * 待测 → 待复核 → 待开工 → 修复中 → 已完工
 * 比例变化时：待复核 → 待测（尺寸失效）；待开工 → 已暂停；已完工保留
 */
export type RegionStatus =
  | "pending"
  | "measured"
  | "reviewed"
  | "paused"
  | "repairing"
  | "done";

export interface RegionEvent {
  at: string;
  by: string;
  text: string;
}

export interface DamageRegion {
  id: string;
  label: string;
  /** 纹样图上的像素位置（不随比例变化） */
  rect: Rect;
  status: RegionStatus;
  /** 尺寸标记；待测/失效时为 null */
  dims: Dimensions | null;
  measuredBy: string | null;
  measuredAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  startedAt: string | null;
  doneAt: string | null;
  history: RegionEvent[];
}

export interface Carpet {
  id: string;
  origin: string;
  era: string;
  material: string;
  dye: string;
  /** 结密度（结/cm²），用于估算补线 */
  knotDensity: number;
  /** 补线色卡 */
  threadColor: string;
  threadHex: string;
  note: string;
  /** 纹样图生成种子 */
  seed: number;
  palette: string[];
  scale: Scale | null;
  regions: DamageRegion[];
}
