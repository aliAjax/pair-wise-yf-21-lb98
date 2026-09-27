import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { Carpet, DamageRegion, Rect, RegionStatus } from "./rules/types";
import { isScaleValid, measureRect } from "./rules/measure";
import {
  MASTERS,
  STATUS_LABEL,
  STATUS_ORDER,
  reviewBlock,
  statusAfterScaleChange,
} from "./rules/workflow";
import { loadArchive, resetArchive, saveArchive } from "./store/archive";
import PatternCanvas, { STATUS_COLORS } from "./components/PatternCanvas";
import ScalePanel from "./components/ScalePanel";
import RegionDetail from "./components/RegionDetail";

const now = () => new Date().toISOString();

function App() {
  const [carpets, setCarpets] = useState<Carpet[]>(loadArchive);
  const [originFilter, setOriginFilter] = useState("全部");
  const [carpetId, setCarpetId] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [currentMaster, setCurrentMaster] = useState(MASTERS[0]);

  // 本地存档：任何改动都落盘，关闭页面再回来仍在
  useEffect(() => {
    saveArchive(carpets);
  }, [carpets]);

  const origins = useMemo(
    () => ["全部", ...Array.from(new Set(carpets.map((c) => c.origin)))],
    [carpets]
  );
  const visibleCarpets = useMemo(
    () =>
      originFilter === "全部"
        ? carpets
        : carpets.filter((c) => c.origin === originFilter),
    [carpets, originFilter]
  );
  const carpet =
    visibleCarpets.find((c) => c.id === carpetId) ?? visibleCarpets[0] ?? null;
  const region = carpet?.regions.find((r) => r.id === regionId) ?? null;

  // 进度汇总：跟随产地筛选与每一次状态变化更新
  const summary = useMemo(() => {
    const counts = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, 0])
    ) as Record<RegionStatus, number>;
    let thread = 0;
    for (const c of visibleCarpets) {
      for (const r of c.regions) {
        counts[r.status] += 1;
        if (r.dims && r.status !== "done") thread += r.dims.threadM;
      }
    }
    const total = STATUS_ORDER.reduce((n, s) => n + counts[s], 0);
    return {
      counts,
      total,
      doneRate: total ? Math.round((counts.done / total) * 100) : 0,
      thread: Math.round(thread * 10) / 10,
    };
  }, [visibleCarpets]);

  // —— 状态修改 ——

  const mutateCarpet = (id: string, fn: (c: Carpet) => Carpet) =>
    setCarpets((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  const mutateRegion = (
    targetCarpetId: string,
    targetRegionId: string,
    fn: (r: DamageRegion, c: Carpet) => DamageRegion
  ) =>
    mutateCarpet(targetCarpetId, (c) => ({
      ...c,
      regions: c.regions.map((r) => (r.id === targetRegionId ? fn(r, c) : r)),
    }));

  const handleCreateRegion = (rect: Rect) => {
    if (!carpet) return;
    const id = `r-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
    const label = `破损区${String(carpet.regions.length + 1).padStart(2, "0")}`;
    const base: DamageRegion = {
      id,
      label,
      rect,
      status: "pending",
      dims: null,
      measuredBy: null,
      measuredAt: null,
      reviewedBy: null,
      reviewedAt: null,
      startedAt: null,
      doneAt: null,
      history: [{ at: now(), by: currentMaster, text: "在纹样图上圈出破损区域" }],
    };
    let created = base;
    if (isScaleValid(carpet.scale)) {
      const dims = measureRect(rect, carpet.scale, carpet.knotDensity);
      created = {
        ...base,
        status: "measured",
        dims,
        measuredBy: currentMaster,
        measuredAt: now(),
        history: [
          {
            at: now(),
            by: currentMaster,
            text: `按当前比例测量：长${dims.heightCm}×宽${dims.widthCm}cm，面积${dims.areaCm2}cm²，需补线${dims.threadM}m`,
          },
          ...base.history,
        ],
      };
    } else {
      created = {
        ...base,
        history: [
          { at: now(), by: "系统", text: "尚未标定比例，区域记为待测" },
          ...base.history,
        ],
      };
    }
    mutateCarpet(carpet.id, (c) => ({ ...c, regions: [...c.regions, created] }));
    setRegionId(id);
  };

  const handleMeasure = () => {
    if (!carpet || !region) return;
    mutateRegion(carpet.id, region.id, (r, c) => {
      if (!isScaleValid(c.scale)) return r;
      if (r.status !== "pending" && r.status !== "paused") return r;
      const dims = measureRect(r.rect, c.scale, c.knotDensity);
      const text =
        r.status === "paused"
          ? `按新比例复测：长${dims.heightCm}×宽${dims.widthCm}cm，面积${dims.areaCm2}cm²，需补线${dims.threadM}m，重新送复核`
          : `测量：长${dims.heightCm}×宽${dims.widthCm}cm，面积${dims.areaCm2}cm²，需补线${dims.threadM}m`;
      return {
        ...r,
        status: "measured",
        dims,
        measuredBy: currentMaster,
        measuredAt: now(),
        reviewedBy: null,
        reviewedAt: null,
        history: [{ at: now(), by: currentMaster, text }, ...r.history],
      };
    });
  };

  const handleReview = (reviewer: string) => {
    if (!carpet || !region) return;
    if (reviewBlock(region, reviewer)) return; // 规则：必须由另一名师傅复核
    mutateRegion(carpet.id, region.id, (r) => ({
      ...r,
      status: "reviewed",
      reviewedBy: reviewer,
      reviewedAt: now(),
      history: [
        { at: now(), by: reviewer, text: "复核通过，尺寸确认，可以开工" },
        ...r.history,
      ],
    }));
  };

  const handleReject = (reviewer: string) => {
    if (!carpet || !region || region.status !== "measured" || !reviewer) return;
    mutateRegion(carpet.id, region.id, (r) => ({
      ...r,
      status: "pending",
      dims: null,
      measuredBy: null,
      measuredAt: null,
      reviewedBy: null,
      reviewedAt: null,
      history: [
        { at: now(), by: reviewer, text: "复核不通过，尺寸标记退回待测" },
        ...r.history,
      ],
    }));
  };

  const handleStart = () => {
    if (!carpet || !region || region.status !== "reviewed") return;
    mutateRegion(carpet.id, region.id, (r) => ({
      ...r,
      status: "repairing",
      startedAt: now(),
      history: [{ at: now(), by: currentMaster, text: "开工补线" }, ...r.history],
    }));
  };

  const handleFinish = () => {
    if (!carpet || !region || region.status !== "repairing") return;
    mutateRegion(carpet.id, region.id, (r) => ({
      ...r,
      status: "done",
      doneAt: now(),
      history: [
        {
          at: now(),
          by: currentMaster,
          text: `完工归档，补线用量按 ${r.dims?.threadM ?? "—"}m 记录`,
        },
        ...r.history,
      ],
    }));
  };

  const handleDelete = () => {
    if (!carpet || !region) return;
    if (region.status !== "pending" && region.status !== "measured") return;
    mutateCarpet(carpet.id, (c) => ({
      ...c,
      regions: c.regions.filter((r) => r.id !== region.id),
    }));
    setRegionId(null);
  };

  // 保存比例：数值变化时按缩水规则处理所有区域
  const handleSaveScale = (warp: number, weft: number, reason: string) => {
    if (!carpet) return;
    mutateCarpet(carpet.id, (c) => {
      const old = c.scale;
      const scale = {
        warpPxPerCm: warp,
        weftPxPerCm: weft,
        by: currentMaster,
        at: now(),
        reason,
      };
      if (!old || (old.warpPxPerCm === warp && old.weftPxPerCm === weft)) {
        return { ...c, scale };
      }
      const note = `比例变更（${reason}）：经向${old.warpPxPerCm}→${warp}、纬向${old.weftPxPerCm}→${weft} px/cm`;
      const regions = c.regions.map((r) => {
        const next = statusAfterScaleChange(r.status);
        if (next === r.status) return r; // 待测/已暂停/修复中/已完工：保持原状
        if (next === "pending") {
          return {
            ...r,
            status: next,
            dims: null,
            measuredBy: null,
            measuredAt: null,
            reviewedBy: null,
            reviewedAt: null,
            history: [
              { at: now(), by: "系统", text: `${note}，尺寸标记失效，退回待测` },
              ...r.history,
            ],
          };
        }
        return {
          ...r,
          status: next,
          history: [
            { at: now(), by: "系统", text: `${note}，已复核未开工，暂停补线` },
            ...r.history,
          ],
        };
      });
      return { ...c, scale, regions };
    });
  };

  const handleReset = () => {
    if (!window.confirm("确定清空本地存档并恢复演示数据？")) return;
    setCarpets(resetArchive());
    setRegionId(null);
  };

  const regionBrief = (c: Carpet) => {
    const parts = STATUS_ORDER.map((s) => {
      const n = c.regions.filter((r) => r.status === s).length;
      return n > 0 ? `${STATUS_LABEL[s]} ${n}` : null;
    }).filter(Boolean);
    return parts.length ? parts.join(" · ") : "暂无破损区域";
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62009 · 手工地毯修复工作室</p>
        <h1>按比例定损台</h1>
        <span>
          录入经纬方向每厘米像素值标定比例，在纹样图上圈出破损区域，自动算出长宽、面积与所需补线长度；
          进入补线前必须由另一名师傅复核尺寸。清洗缩水导致比例变化时：未复核区域尺寸失效退回待测，
          已复核未开工的区域暂停，已完工记录保留。
        </span>
        <div className="master-bar">
          <span>当前操作师傅</span>
          <select
            value={currentMaster}
            onChange={(e) => setCurrentMaster(e.target.value)}
          >
            {MASTERS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="metrics">
        {STATUS_ORDER.map((s) => (
          <article key={s} style={{ borderTopColor: STATUS_COLORS[s] }}>
            <small>{STATUS_LABEL[s]}</small>
            <strong>{summary.counts[s]}</strong>
          </article>
        ))}
        <article className="rate">
          <small>完工率（{originFilter}）</small>
          <strong>{summary.doneRate}%</strong>
        </article>
        <article className="rate">
          <small>待用补线合计</small>
          <strong>{summary.thread}m</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>产地筛选</h2>
          <div className="chips">
            {origins.map((o) => (
              <button
                key={o}
                className={o === originFilter ? "active" : ""}
                onClick={() => setOriginFilter(o)}
              >
                {o}
              </button>
            ))}
          </div>

          <h2 className="mt">纹样档案（{visibleCarpets.length}）</h2>
          <div className="carpet-list">
            {visibleCarpets.map((c) => (
              <button
                key={c.id}
                className={
                  "carpet-card" + (carpet && c.id === carpet.id ? " active" : "")
                }
                onClick={() => {
                  setCarpetId(c.id);
                  setRegionId(null);
                }}
              >
                <div className="cc-head">
                  <b>{c.id}</b>
                  <span>{c.origin}</span>
                </div>
                <p>
                  {c.era} · {c.material} · 结密度{c.knotDensity}
                </p>
                <p className="cc-note">{c.note}</p>
                <small>{regionBrief(c)}</small>
              </button>
            ))}
          </div>

          <button className="ghost mt" onClick={handleReset}>
            重置演示数据
          </button>
        </aside>

        <section className="panel station">
          {carpet ? (
            <>
              <div className="heading">
                <div>
                  <p>
                    {carpet.origin} · {carpet.era}
                  </p>
                  <h2>{carpet.id} 定损台</h2>
                </div>
                <span className="flow-hint">
                  标定比例 → 圈区测量 → 换人复核 → 开工 → 完工
                </span>
              </div>

              <div className="info-chips">
                <span>材质：{carpet.material}</span>
                <span>染色：{carpet.dye}</span>
                <span>结密度：{carpet.knotDensity} 结/cm²</span>
                <span>
                  补线色卡：
                  <i className="swatch" style={{ background: carpet.threadHex }} />
                  {carpet.threadColor}
                </span>
              </div>

              <ScalePanel scale={carpet.scale} onSave={handleSaveScale} />

              <div className="board">
                <div className="canvas-wrap">
                  <PatternCanvas
                    carpet={carpet}
                    selectedRegionId={regionId}
                    onSelectRegion={setRegionId}
                    onCreateRegion={handleCreateRegion}
                  />
                  <div className="legend">
                    {STATUS_ORDER.map((s) => (
                      <span key={s}>
                        <i className="dot" style={{ background: STATUS_COLORS[s] }} />
                        {STATUS_LABEL[s]}
                      </span>
                    ))}
                  </div>
                  <p className="hint">在纹样图上按住拖动即可圈出破损区域；点击已有区域查看详情。</p>
                </div>

                <div className="region-list">
                  <h3>破损区域（{carpet.regions.length}）</h3>
                  {carpet.regions.length === 0 && (
                    <p className="hint">还没有区域，先在纹样图上圈一处破损。</p>
                  )}
                  {carpet.regions.map((r) => (
                    <button
                      key={r.id}
                      className={
                        "region-row" + (r.id === regionId ? " active" : "")
                      }
                      onClick={() => setRegionId(r.id)}
                    >
                      <span
                        className="dot"
                        style={{ background: STATUS_COLORS[r.status] }}
                      />
                      <span className="rr-main">
                        <b>{r.label}</b>
                        <small>
                          {r.dims
                            ? `长${r.dims.heightCm}×宽${r.dims.widthCm}cm · ${r.dims.areaCm2}cm² · 补线${r.dims.threadM}m`
                            : STATUS_LABEL[r.status]}
                        </small>
                        <small>复核人：{r.reviewedBy ?? "—"}</small>
                      </span>
                      <span
                        className="badge"
                        style={{ background: STATUS_COLORS[r.status] }}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {region && (
                <RegionDetail
                  key={`${region.id}:${region.status}`}
                  region={region}
                  scaleReady={isScaleValid(carpet.scale)}
                  onMeasure={handleMeasure}
                  onReview={handleReview}
                  onReject={handleReject}
                  onStart={handleStart}
                  onFinish={handleFinish}
                  onDelete={handleDelete}
                />
              )}
            </>
          ) : (
            <p className="hint">当前筛选下没有地毯档案。</p>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
