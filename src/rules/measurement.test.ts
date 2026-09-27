import { describe, expect, it, beforeEach } from "vitest";
import {
  __setClock,
  applyRescale,
  approveReview,
  assertDifferentPerson,
  canStart,
  completeRepair,
  measureRect,
  normalizeRect,
  rejectReview,
  startRepair,
  submitMeasurement,
  summarizeRegions,
  validateScale,
  type Region,
  type Scale,
} from "./measurement";

const SCALE: Scale = { pxPerCmX: 10, pxPerCmY: 20 };

let seq = 0;
function makeRegion(partial: Partial<Region> = {}): Region {
  seq += 1;
  return {
    id: `t${seq}`,
    index: seq,
    label: `区域 ${seq}`,
    rect: { x: 0, y: 0, width: 100, height: 100 },
    status: "pending",
    measurement: null,
    staleMeasurement: null,
    reviewedBy: null,
    reviewedAt: null,
    startedAt: null,
    completedAt: null,
    invalidationCount: 0,
    yarnColor: "",
    note: "",
    history: [],
    ...partial,
  };
}

beforeEach(() => {
  __setClock(() => "2026-09-20T08:00:00.000Z");
});

describe("尺寸换算", () => {
  it("经纬方向分别使用各自的 px/cm 值", () => {
    // 宽 100px ÷ 10px/cm = 10cm；高 100px ÷ 20px/cm = 5cm
    const d = measureRect({ x: 0, y: 0, width: 100, height: 100 }, SCALE);
    expect(d.widthCm).toBe(10);
    expect(d.lengthCm).toBe(5);
    expect(d.areaCm2).toBe(50);
    expect(d.perimeterCm).toBe(30);
    // 补线 = 周长*2 + 面积*6 = 60 + 300
    expect(d.yarnCm).toBe(360);
  });

  it("拒绝非法比例", () => {
    expect(() => validateScale({ pxPerCmX: 0, pxPerCmY: 1 })).toThrow();
    expect(() => validateScale({ pxPerCmX: 1, pxPerCmY: NaN })).toThrow();
    expect(() => validateScale({ pxPerCmX: -2, pxPerCmY: 1 })).toThrow();
  });

  it("圈选矩形归一化并限制最小尺寸", () => {
    const r = normalizeRect({ x: 90, y: 90, width: -40, height: -20 }, 1000, 700);
    expect(r).toEqual({ x: 50, y: 70, width: 40, height: 20 });
    expect(() => normalizeRect({ x: 0, y: 0, width: 4, height: 80 }, 1000, 700)).toThrow();
  });

  it("矩形被夹取到纹样图边界内", () => {
    const r = normalizeRect({ x: 990, y: 690, width: 50, height: 50 }, 1000, 700);
    expect(r.width).toBe(10);
    expect(r.height).toBe(10);
  });
});

describe("定损状态流转", () => {
  it("测量后进入待复核，不能直接开工", () => {
    const measured = submitMeasurement(makeRegion(), SCALE, "李纹");
    expect(measured.status).toBe("measured");
    expect(measured.measurement?.measuredBy).toBe("李纹");
    expect(canStart(measured)).toBe(false);
  });

  it("复核人不得与测量人为同一人", () => {
    const measured = submitMeasurement(makeRegion(), SCALE, "李纹");
    expect(() => approveReview(measured, "李纹")).toThrow(/同一人/);
    const approved = approveReview(measured, "王朴");
    expect(approved.status).toBe("reviewed");
    expect(approved.reviewedBy).toBe("王朴");
  });

  it("姓名空白校验", () => {
    expect(() => assertDifferentPerson("  ", "李纹", "测量人")).toThrow();
  });

  it("必须复核通过后才能开工、完工", () => {
    const pending = makeRegion();
    expect(() => startRepair(pending, "赵织")).toThrow(/复核/);
    const measured = submitMeasurement(pending, SCALE, "李纹");
    const reviewed = approveReview(measured, "王朴");
    const active = startRepair(reviewed, "赵织");
    expect(active.status).toBe("active");
    const done = completeRepair(active, "赵织");
    expect(done.status).toBe("done");
    expect(done.completedAt).toBeTruthy();
  });

  it("复核退回后尺寸清空、回到待测", () => {
    const measured = submitMeasurement(makeRegion(), SCALE, "李纹");
    const rejected = rejectReview(measured, "王朴");
    expect(rejected.status).toBe("pending");
    expect(rejected.measurement).toBeNull();
  });

  it("已完工区域不能重新测量", () => {
    const measured = submitMeasurement(makeRegion(), SCALE, "李纹");
    const reviewed = approveReview(measured, "王朴");
    const active = startRepair(reviewed, "赵织");
    const done = completeRepair(active, "赵织");
    expect(() => submitMeasurement(done, SCALE, "钱工")).toThrow();
  });
});

describe("清洗缩水重新定标", () => {
  const NEW_SCALE: Scale = { pxPerCmX: 12, pxPerCmY: 24 };

  it("未复核区域尺寸失效退回待测，保留圈选框", () => {
    const pending = makeRegion();
    const measured = submitMeasurement(makeRegion(), SCALE, "李纹");
    const res = applyRescale([pending, measured], SCALE, NEW_SCALE, "陈静");
    expect(res.invalidated).toHaveLength(2);
    for (const r of res.regions) {
      expect(r.status).toBe("pending");
      expect(r.measurement).toBeNull();
      expect(r.reviewedBy).toBeNull();
      expect(r.rect.width).toBe(100); // 圈选框保留
      expect(r.invalidationCount).toBe(1);
    }
  });

  it("已复核未开工区域暂停并保留旧尺寸对照", () => {
    const measured = submitMeasurement(makeRegion(), SCALE, "李纹");
    const reviewed = approveReview(measured, "王朴");
    const res = applyRescale([reviewed], SCALE, NEW_SCALE, "陈静");
    expect(res.paused).toHaveLength(1);
    const paused = res.regions[0];
    expect(paused.status).toBe("paused");
    expect(paused.measurement).toBeNull();
    expect(paused.staleMeasurement).not.toBeNull();
    expect(paused.staleMeasurement?.yarnCm).toBe(reviewed.measurement?.yarnCm);
    expect(paused.reviewedBy).toBe("王朴"); // 旧复核痕迹保留可追溯
  });

  it("暂停区域按新比例重测后需再次由他人复核才能开工", () => {
    const reviewed = approveReview(submitMeasurement(makeRegion(), SCALE, "李纹"), "王朴");
    const paused = applyRescale([reviewed], SCALE, NEW_SCALE, "陈静").regions[0];
    const remeasured = submitMeasurement(paused, NEW_SCALE, "李纹");
    expect(remeasured.status).toBe("measured");
    expect(remeasured.measurement?.scale).toEqual(NEW_SCALE);
    expect(canStart(remeasured)).toBe(false);
    const reapproved = approveReview(remeasured, "王朴");
    expect(reapproved.status).toBe("reviewed");
    expect(reapproved.staleMeasurement).toBeNull();
  });

  it("已开工与已完工记录原样保留", () => {
    const active = startRepair(
      approveReview(submitMeasurement(makeRegion(), SCALE, "李纹"), "王朴"),
      "赵织",
    );
    const done = completeRepair(active, "赵织");
    const res = applyRescale([active, done], SCALE, NEW_SCALE, "陈静");
    expect(res.untouched).toHaveLength(2);
    expect(res.regions[0].status).toBe("active");
    expect(res.regions[1].status).toBe("done");
    expect(res.regions[1].measurement).toEqual(done.measurement);
  });

  it("新旧比例相同时拒绝作废", () => {
    const measured = submitMeasurement(makeRegion(), SCALE, "李纹");
    expect(() => applyRescale([measured], SCALE, { ...SCALE }, "陈静")).toThrow();
  });

  it("首次定标（oldScale 为 null）允许应用任意有效比例", () => {
    const pending = makeRegion();
    const res = applyRescale([pending], null, SCALE, "陈静");
    expect(res.invalidated).toHaveLength(1);
  });
});

describe("进度汇总", () => {
  it("按状态计数、备线合计只统计有效尺寸、完工率正确", () => {
    const reviewed = approveReview(submitMeasurement(makeRegion(), SCALE, "李纹"), "王朴");
    const done = completeRepair(startRepair(reviewed, "赵织"), "赵织");
    const pending = makeRegion();
    const summary = summarizeRegions([reviewed, done, pending]);
    expect(summary.total).toBe(3);
    expect(summary.byStatus.reviewed).toBe(1);
    expect(summary.byStatus.done).toBe(1);
    expect(summary.byStatus.pending).toBe(1);
    expect(summary.doneRate).toBeCloseTo(1 / 3);
    // reviewed + done 两个区域的有效备线（各 360cm）
    expect(summary.yarnTotalCm).toBe(720);
  });
});
