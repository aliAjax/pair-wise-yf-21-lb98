import type { Dimensions, Point, Rect, Scale } from "./types";

/**
 * 尺寸与补线规则。
 * 工作室如需调整估算口径，只改这个文件，不动页面和存档。
 */

/** 每个结平均用线长度（厘米） */
export const THREAD_PER_KNOT_CM = 2.2;
/** 裁剪与打结损耗比例 */
export const WASTE_RATIO = 0.15;
/** 圈选区域的最小边长（图像像素），小于此值视为误触 */
export const MIN_REGION_PX = 10;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function isScaleValid(scale: Scale | null): scale is Scale {
  return !!scale && scale.warpPxPerCm > 0 && scale.weftPxPerCm > 0;
}

/**
 * 由像素矩形换算真实尺寸：
 * 横向（纬向）像素 ÷ 纬向每厘米像素 = 宽；
 * 纵向（经向）像素 ÷ 经向每厘米像素 = 长；
 * 补线长度 = 面积 × 结密度 × 每结用线 ×（1 + 损耗）。
 */
export function measureRect(
  rect: Rect,
  scale: Scale,
  knotDensity: number
): Dimensions {
  const widthCm = round1(rect.w / scale.weftPxPerCm);
  const heightCm = round1(rect.h / scale.warpPxPerCm);
  const areaCm2 = round1(widthCm * heightCm);
  const knots = areaCm2 * knotDensity;
  const threadM = round1((knots * THREAD_PER_KNOT_CM * (1 + WASTE_RATIO)) / 100);
  return { widthCm, heightCm, areaCm2, threadM };
}

/** 两个角点规整为左上角 + 宽高 */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
