import type { DamageRegion, RegionStatus } from "./types";

/**
 * 修复工序流转规则。
 * 与尺寸换算（measure.ts）、页面、存档分开维护。
 */

/** 工作室师傅名册 */
export const MASTERS = ["王建国", "李秀兰", "阿依古丽", "赵铁柱", "陈明玉"];

export const STATUS_LABEL: Record<RegionStatus, string> = {
  pending: "待测",
  measured: "待复核",
  reviewed: "待开工",
  paused: "已暂停",
  repairing: "修复中",
  done: "已完工",
};

export const STATUS_ORDER: RegionStatus[] = [
  "pending",
  "measured",
  "reviewed",
  "paused",
  "repairing",
  "done",
];

/** 复核规则：必须是测量人之外的另一名师傅；返回 null 表示可以复核 */
export function reviewBlock(region: DamageRegion, reviewer: string): string | null {
  if (region.status !== "measured") return "只有待复核区域可以复核";
  if (!reviewer) return "请选择复核师傅";
  if (reviewer === region.measuredBy) return "复核人必须是另一名师傅";
  return null;
}

/** 已复核（待开工）才能开工补线 */
export function canStart(region: DamageRegion): boolean {
  return region.status === "reviewed";
}

/** 修复中才能完工 */
export function canFinish(region: DamageRegion): boolean {
  return region.status === "repairing";
}

/** 待测或已暂停可以（重新）测量 */
export function canMeasure(region: DamageRegion): boolean {
  return region.status === "pending" || region.status === "paused";
}

/** 只有未进入复核流程的区域可以删除，已复核及以后的记录保留 */
export function canDelete(region: DamageRegion): boolean {
  return region.status === "pending" || region.status === "measured";
}

/**
 * 清洗缩水等原因导致比例变化时，各状态的去向：
 * - 待复核（未复核）→ 待测：尺寸标记失效，退回待测
 * - 待开工（已复核未开工）→ 已暂停
 * - 待测 / 已暂停 / 修复中 / 已完工：保持原状，已完工记录保留
 */
export function statusAfterScaleChange(status: RegionStatus): RegionStatus {
  if (status === "measured") return "pending";
  if (status === "reviewed") return "paused";
  return status;
}
