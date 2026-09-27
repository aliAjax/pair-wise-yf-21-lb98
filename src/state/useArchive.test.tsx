// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useArchive } from "./useArchive";
import type { Region, Scale } from "../rules/measurement";

beforeEach(() => {
  localStorage.clear();
});

/** act 内同步抛错的断言辅助 */
function expectActThrow(fn: () => void, matcher: RegExp) {
  try {
    act(fn);
  } catch (err) {
    expect((err as Error).message).toMatch(matcher);
    return;
  }
  throw new Error("预期操作应抛错，但没有");
}

function regionOf(result: ReturnType<typeof renderHook<ReturnType<typeof useArchive>, unknown>>["result"], carpetId: string, regionId: string): Region {
  return result.current.data.carpets.find((c) => c.id === carpetId)!.regions.find((r) => r.id === regionId)!;
}

describe("定损台端到端（useArchive + localStorage）", () => {
  it("录入比例→圈选→测量→异名师复核→开工→完工，并跨重载保留区域与复核人", () => {
    const { result } = renderHook(() => useArchive());

    // 0. 新建档案（未定标）
    let first = "";
    act(() => {
      first = result.current.addCarpet({
        origin: "高加索",
        era: "约1970s",
        knotDensity: "40",
        material: "羊毛",
        dyeType: "植物染",
      });
    });
    expect(result.current.origins).toContain("高加索");

    // 1. 首次定标
    act(() => {
      result.current.calibrate(first, { pxPerCmX: 9.6, pxPerCmY: 10.4 } as Scale, "李纹");
    });
    expect(result.current.data.carpets.find((c) => c.id === first)!.scale).toEqual({
      pxPerCmX: 9.6,
      pxPerCmY: 10.4,
    });

    // 2. 圈选破损区域
    let rid = "";
    act(() => {
      rid = result.current.addRegion(first, { x: 100, y: 100, width: 96, height: 104 }, "测试破洞");
    });
    expect(result.current.data.carpets.find((c) => c.id === first)!.regions).toHaveLength(1);
    expect(regionOf(result, first, rid).status).toBe("pending");

    // 3. 测量：96/9.6=10cm 宽，104/10.4=10cm 长，面积100，补线=40*2+100*6=680
    act(() => {
      result.current.measure(first, rid, "李纹");
    });
    expect(regionOf(result, first, rid).status).toBe("measured");
    expect(regionOf(result, first, rid).measurement).toMatchObject({
      widthCm: 10,
      lengthCm: 10,
      areaCm2: 100,
      yarnCm: 680,
    });

    // 4. 同一人复核必须被拒绝
    expectActThrow(
      () => result.current.review(first, rid, "李纹", true),
      /同一人/,
    );
    expect(regionOf(result, first, rid).status).toBe("measured");

    // 5. 另一名师傅复核通过
    act(() => {
      result.current.review(first, rid, "王朴", true);
    });
    expect(regionOf(result, first, rid).status).toBe("reviewed");
    expect(regionOf(result, first, rid).reviewedBy).toBe("王朴");

    // 6. 开工 + 完工
    act(() => {
      result.current.start(first, rid, "赵织");
    });
    expect(regionOf(result, first, rid).status).toBe("active");
    act(() => {
      result.current.complete(first, rid, "赵织");
    });
    expect(regionOf(result, first, rid).status).toBe("done");

    // 7. 重新加载存档：区域与复核人仍在
    const { result: reloaded } = renderHook(() => useArchive());
    const saved = reloaded.current.data.carpets
      .find((c) => c.id === first)!
      .regions.find((r) => r.id === rid)!;
    expect(saved.status).toBe("done");
    expect(saved.reviewedBy).toBe("王朴");
    expect(saved.measurement?.yarnCm).toBe(680);
    expect(saved.history.some((h) => h.kind === "reviewed" && h.by === "王朴")).toBe(true);
  });

  it("缩水：未复核失效退回待测、已复核未开工暂停、已完工保留", () => {
    const { result } = renderHook(() => useArchive());
    const carId = result.current.data.carpets[0].id; // CAR-092：done / reviewed / measured
    const [doneInit, reviewedInit, measuredInit] = result.current.data.carpets[0].regions;
    expect(doneInit.status).toBe("done");
    expect(reviewedInit.status).toBe("reviewed");
    expect(measuredInit.status).toBe("measured");

    let summary: { invalidated: number; paused: number } | undefined;
    act(() => {
      summary = result.current.rescale(carId, { pxPerCmX: 12, pxPerCmY: 13 }, "陈静");
    });
    expect(summary).toEqual({ invalidated: 1, paused: 1 });

    const done = regionOf(result, carId, doneInit.id);
    const reviewed = regionOf(result, carId, reviewedInit.id);
    const measured = regionOf(result, carId, measuredInit.id);

    expect(done.status).toBe("done"); // 完工保留
    expect(done.measurement).not.toBeNull();
    expect(reviewed.status).toBe("paused"); // 已复核未开工 → 暂停
    expect(reviewed.measurement).toBeNull();
    expect(reviewed.staleMeasurement).not.toBeNull();
    expect(reviewed.reviewedBy).toBe("陈静"); // seed 中该区域复核人
    expect(measured.status).toBe("pending"); // 未复核 → 失效退回待测
    expect(measured.measurement).toBeNull();

    // 暂停区域按新比例重测后仍需他人复核
    act(() => {
      result.current.measure(carId, reviewed.id, "李纹");
    });
    expect(regionOf(result, carId, reviewed.id).status).toBe("measured");
    expect(regionOf(result, carId, reviewed.id).measurement?.scale).toEqual({
      pxPerCmX: 12,
      pxPerCmY: 13,
    });
    expectActThrow(
      () => result.current.review(carId, reviewed.id, "李纹", true),
      /同一人/,
    );
    act(() => {
      result.current.review(carId, reviewed.id, "王朴", true);
    });
    expect(regionOf(result, carId, reviewed.id).status).toBe("reviewed");
  });

  it("产地列表随档案更新；完工区域不可删除、待复核区域可删除", () => {
    const { result } = renderHook(() => useArchive());
    expect(result.current.origins).toContain("波斯");
    expect(result.current.origins).toContain("藏毯");

    const carId = result.current.data.carpets[0].id;
    const doneId = result.current.data.carpets[0].regions[0].id;
    const measuredId = result.current.data.carpets[0].regions[2].id;

    expectActThrow(() => result.current.removeRegion(carId, doneId), /完工/);

    act(() => {
      result.current.removeRegion(carId, measuredId);
    });
    expect(
      result.current.data.carpets[0].regions.some((r) => r.id === measuredId),
    ).toBe(false);
  });
});
