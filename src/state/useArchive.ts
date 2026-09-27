import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadArchive,
  saveArchive,
  resetArchive,
  nextCarpetId,
  newRegionId,
  type ArchiveData,
  type Carpet,
} from "../storage/archiveStore";
import {
  applyRescale,
  approveReview,
  completeRepair,
  rejectReview,
  startRepair,
  submitMeasurement,
  validateScale,
  type Region,
  type Scale,
  now,
} from "../rules/measurement";

export interface NewCarpetInput {
  origin: string;
  era: string;
  knotDensity: string;
  material: string;
  dyeType: string;
}

/**
 * 页面状态层：所有规则调用都在事件处理器中同步完成（校验失败直接抛错供页面提示），
 * 成功后一次性写入存档。
 */
export function useArchive() {
  const [data, setData] = useState<ArchiveData>(() => loadArchive());
  const [savedAt, setSavedAt] = useState<string>(() => new Date().toLocaleTimeString());
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
    saveArchive(data);
    setSavedAt(new Date().toLocaleTimeString());
  }, [data]);

  const patchCarpet = useCallback((carpetId: string, next: Carpet) => {
    setData((prev) => ({
      ...prev,
      carpets: prev.carpets.map((c) => (c.id === carpetId ? next : c)),
    }));
  }, []);

  /** 基于最新存档同步执行规则，校验失败直接抛错供页面提示 */
  const withLatest = useCallback(<T,>(fn: (current: ArchiveData) => T): T => {
    return fn(dataRef.current);
  }, []);

  const addCarpet = useCallback(
    (input: NewCarpetInput): string => {
      const id = nextCarpetId(dataRef.current.carpets);
      const carpet: Carpet = {
        id,
        origin: input.origin.trim() || "未分类",
        era: input.era.trim(),
        knotDensity: input.knotDensity.trim(),
        material: input.material.trim(),
        dyeType: input.dyeType.trim(),
        pattern: { url: FALLBACK_PATTERN, width: 1000, height: 700 },
        scale: null,
        scaleHistory: [],
        regions: [],
        createdAt: now(),
      };
      setData((prev) => ({ ...prev, carpets: [...prev.carpets, carpet] }));
      return id;
    },
    [],
  );

  /** 首次录入经/纬比例（未定标地毯） */
  const calibrate = useCallback(
    (carpetId: string, scale: Scale, by: string) => {
      withLatest((current) => {
        const valid = validateScale(scale);
        const name = by.trim();
        if (!name) throw new Error("请填写定标师傅姓名");
        const carpet = mustFind(current, carpetId);
        if (carpet.scale) throw new Error("该地毯已定标，缩水请使用「清洗缩水重新定标」");
        patchCarpet(carpetId, {
          ...carpet,
          scale: valid,
          scaleHistory: [
            ...carpet.scaleHistory,
            { at: now(), ...valid, source: "initial" as const, by: name },
          ],
        });
      });
    },
    [patchCarpet, withLatest],
  );

  /** 清洗后缩水：新比例作废未复核尺寸、暂停已复核未开工区域 */
  const rescale = useCallback(
    (carpetId: string, newScale: Scale, by: string) => {
      return withLatest((current) => {
        const valid = validateScale(newScale);
        const name = by.trim();
        if (!name) throw new Error("请登记执行缩水定标的师傅姓名");
        const carpet = mustFind(current, carpetId);
        const result = applyRescale(carpet.regions, carpet.scale, valid, name);
        patchCarpet(carpetId, {
          ...carpet,
          scale: valid,
          regions: result.regions,
          scaleHistory: [
            ...carpet.scaleHistory,
            { at: now(), ...valid, source: "shrink" as const, by: name },
          ],
        });
        return { invalidated: result.invalidated.length, paused: result.paused.length };
      });
    },
    [patchCarpet, withLatest],
  );

  const addRegion = useCallback(
    (carpetId: string, rect: Region["rect"], label: string) => {
      return withLatest((current) => {
        const carpet = mustFind(current, carpetId);
        const index = carpet.regions.length + 1;
        const region: Region = {
          id: newRegionId(),
          index,
          label: label.trim() || `破损区域 ${index}`,
          rect,
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
          history: [{ at: now(), kind: "created", by: "档案员" }],
        };
        patchCarpet(carpetId, { ...carpet, regions: [...carpet.regions, region] });
        return region.id;
      });
    },
    [patchCarpet, withLatest],
  );

  const measure = useCallback(
    (carpetId: string, regionId: string, measuredBy: string) => {
      withLatest((current) => {
        const carpet = mustFind(current, carpetId);
        if (!carpet.scale) throw new Error("请先录入经纬方向每厘米像素值");
        const region = mustFindRegion(carpet, regionId);
        const next = submitMeasurement(region, carpet.scale, measuredBy);
        patchCarpet(carpetId, {
          ...carpet,
          regions: carpet.regions.map((r) => (r.id === regionId ? next : r)),
        });
      });
    },
    [patchCarpet, withLatest],
  );

  const review = useCallback(
    (carpetId: string, regionId: string, reviewer: string, approve: boolean) => {
      withLatest((current) => {
        const carpet = mustFind(current, carpetId);
        const region = mustFindRegion(carpet, regionId);
        const next = approve ? approveReview(region, reviewer) : rejectReview(region, reviewer);
        patchCarpet(carpetId, {
          ...carpet,
          regions: carpet.regions.map((r) => (r.id === regionId ? next : r)),
        });
      });
    },
    [patchCarpet, withLatest],
  );

  const start = useCallback(
    (carpetId: string, regionId: string, by: string) => {
      withLatest((current) => {
        const carpet = mustFind(current, carpetId);
        const next = startRepair(mustFindRegion(carpet, regionId), by);
        patchCarpet(carpetId, {
          ...carpet,
          regions: carpet.regions.map((r) => (r.id === regionId ? next : r)),
        });
      });
    },
    [patchCarpet, withLatest],
  );

  const complete = useCallback(
    (carpetId: string, regionId: string, by: string) => {
      withLatest((current) => {
        const carpet = mustFind(current, carpetId);
        const next = completeRepair(mustFindRegion(carpet, regionId), by);
        patchCarpet(carpetId, {
          ...carpet,
          regions: carpet.regions.map((r) => (r.id === regionId ? next : r)),
        });
      });
    },
    [patchCarpet, withLatest],
  );

  const removeRegion = useCallback(
    (carpetId: string, regionId: string) => {
      withLatest((current) => {
        const carpet = mustFind(current, carpetId);
        const target = mustFindRegion(carpet, regionId);
        if (target.status === "done" || target.status === "active") {
          throw new Error("已完工记录必须保留，补线中的区域不能删除");
        }
        patchCarpet(carpetId, {
          ...carpet,
          regions: carpet.regions
            .filter((r) => r.id !== regionId)
            .map((r, i) => ({ ...r, index: i + 1 })),
        });
      });
    },
    [patchCarpet, withLatest],
  );

  const updateRegionMeta = useCallback(
    (carpetId: string, regionId: string, patch: Pick<Region, "label" | "yarnColor" | "note">) => {
      withLatest((current) => {
        const carpet = mustFind(current, carpetId);
        patchCarpet(carpetId, {
          ...carpet,
          regions: carpet.regions.map((r) => (r.id === regionId ? { ...r, ...patch } : r)),
        });
      });
    },
    [patchCarpet, withLatest],
  );

  const restoreSeed = useCallback(() => setData(resetArchive()), []);

  const origins = useMemo(
    () => Array.from(new Set(data.carpets.map((c) => c.origin))),
    [data.carpets],
  );

  return {
    data,
    savedAt,
    origins,
    addCarpet,
    calibrate,
    rescale,
    addRegion,
    measure,
    review,
    start,
    complete,
    removeRegion,
    updateRegionMeta,
    restoreSeed,
  };
}

function mustFind(data: ArchiveData, carpetId: string): Carpet {
  const carpet = data.carpets.find((c) => c.id === carpetId);
  if (!carpet) throw new Error("地毯档案不存在");
  return carpet;
}

function mustFindRegion(carpet: Carpet, regionId: string): Region {
  const region = carpet.regions.find((r) => r.id === regionId);
  if (!region) throw new Error("破损区域不存在");
  return region;
}

/** 新建地毯的占位纹样图 */
const FALLBACK_PATTERN = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="#eef2f7"/><rect x="40" y="40" width="920" height="620" fill="none" stroke="#94a3b8" stroke-width="6" stroke-dasharray="20 16"/><text x="500" y="350" text-anchor="middle" font-size="42" fill="#64748b" font-family="sans-serif">占位纹样图</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();
