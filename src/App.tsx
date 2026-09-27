import { useMemo, useState } from "react";
import { useArchive } from "./state/useArchive";
import type { Carpet } from "./storage/archiveStore";
import { PatternBoard } from "./components/PatternBoard";
import { CalibrateForm, ShrinkForm } from "./components/ScalePanel";
import { RegionPanel } from "./components/RegionPanel";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  summarizeRegions,
  type Region,
  type RegionStatus,
} from "./rules/measurement";

const ALL_ORIGINS = "全部产地";

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

function App() {
  const archive = useArchive();
  const { data } = archive;

  const [origin, setOrigin] = useState<string>(ALL_ORIGINS);
  const [carpetId, setCarpetId] = useState<string | null>(data.carpets[0]?.id ?? null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showNew, setShowNew] = useState(false);

  const notify = (msg: string, kind: Toast["kind"] = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3600);
  };

  const run = (fn: () => void, okMsg?: string) => {
    try {
      fn();
      if (okMsg) notify(okMsg);
    } catch (err) {
      notify((err as Error).message, "err");
    }
  };

  const carpets =
    origin === ALL_ORIGINS ? data.carpets : data.carpets.filter((c) => c.origin === origin);
  const carpet = carpets.find((c) => c.id === carpetId) ?? carpets[0] ?? null;

  const totals = useMemo(() => {
    const all = carpets.flatMap((c) => c.regions);
    return summarizeRegions(all);
  }, [carpets]);

  const selectCarpet = (id: string) => {
    setCarpetId(id);
    setRegionId(null);
  };

  const region = carpet?.regions.find((r) => r.id === regionId) ?? null;

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p>手工地毯修复工作室 · 按比例定损台</p>
          <h1>纹样档案与补线尺寸管理</h1>
        </div>
        <div className="save-state">
          <span className="save-dot" /> 已本地存档 · {archive.savedAt}
          <button
            className="link-btn"
            onClick={() =>
              run(
                () => {
                  archive.restoreSeed();
                  setOrigin(ALL_ORIGINS);
                  setRegionId(null);
                },
                "已恢复为示例档案",
              )
            }
          >
            重置示例数据
          </button>
        </div>
      </header>

      {/* 进度汇总（随产地筛选联动） */}
      <section className="metrics">
        <Metric label="在档地毯" value={String(carpets.length)} />
        <Metric label="待测 / 失效退回" value={String(totals.byStatus.pending)} tone="#94a3b8" />
        <Metric label="待另一名师傅复核" value={String(totals.byStatus.measured)} tone="#b45309" />
        <Metric label="缩水暂停" value={String(totals.byStatus.paused)} tone="#dc2626" />
        <Metric label="补线中" value={String(totals.byStatus.active)} tone="#7c2d12" />
        <Metric label="已完工" value={String(totals.byStatus.done)} tone="#0f766e" />
        <Metric
          label="有效尺寸备线合计"
          value={String(totals.yarnTotalCm)}
          unit="cm"
          tone="#0f766e"
        />
        <Metric
          label="区域完工率"
          value={totals.total ? `${Math.round(totals.doneRate * 100)}%` : "—"}
          tone="#0f766e"
        />
      </section>

      <div className="layout">
        {/* 左栏：产地筛选 + 档案列表 */}
        <aside className="sidebar">
          <h2>按产地筛选</h2>
          <div className="chips">
            <button
              className={origin === ALL_ORIGINS ? "chip-on" : ""}
              onClick={() => {
                setOrigin(ALL_ORIGINS);
              }}
            >
              全部
            </button>
            {archive.origins.map((o) => (
              <button key={o} className={origin === o ? "chip-on" : ""} onClick={() => setOrigin(o)}>
                {o}
              </button>
            ))}
          </div>

          <h2 className="mt">档案列表</h2>
          <div className="carpet-list">
            {carpets.length === 0 && <p className="muted">该产地暂无档案。</p>}
            {carpets.map((c) => (
              <CarpetCard
                key={c.id}
                carpet={c}
                active={carpet?.id === c.id}
                onSelect={() => selectCarpet(c.id)}
              />
            ))}
          </div>

          <button className="primary full" onClick={() => setShowNew((v) => !v)}>
            {showNew ? "收起新增表单" : "＋ 新增地毯档案"}
          </button>
          {showNew && (
            <NewCarpetForm
              onCreate={(input) =>
                run(
                  () => {
                    const id = archive.addCarpet(input);
                    setOrigin(ALL_ORIGINS);
                    selectCarpet(id);
                    setShowNew(false);
                  },
                  "新档案已建立，请录入比例",
                )
              }
            />
          )}
        </aside>

        {/* 右栏：定损台 */}
        <section className="stage">
          {!carpet ? (
            <div className="panel empty-stage">
              <h2>还没有档案</h2>
              <p className="muted">从左侧新增一块地毯，开始按比例定损。</p>
            </div>
          ) : (
            <>
              <div className="carpet-head panel">
                <div>
                  <h2>
                    {carpet.id}
                    <span className="origin-tag">{carpet.origin}</span>
                  </h2>
                  <p>
                    {[carpet.era, carpet.knotDensity, carpet.material, carpet.dyeType]
                      .filter(Boolean)
                      .join(" · ") || "资料待补全"}
                  </p>
                </div>
                <ScaleBadge carpet={carpet} />
              </div>

              <div className="work-grid">
                <div className="board-col">
                  <div className="panel">
                    <PatternBoard
                      carpet={carpet}
                      selectedId={regionId}
                      onSelect={setRegionId}
                      onDraw={(rect) =>
                        run(
                          () => {
                            const id = archive.addRegion(carpet.id, rect, "");
                            setRegionId(id);
                          },
                          "破损区域已圈出，请在右侧计算尺寸",
                        )
                      }
                      onError={(msg) => notify(msg, "err")}
                    />
                  </div>
                  <div className="panel region-strip">
                    {carpet.regions.length === 0 ? (
                      <p className="muted">尚无破损区域。</p>
                    ) : (
                      carpet.regions.map((r) => (
                        <button
                          key={r.id}
                          className={"region-chip" + (r.id === regionId ? " region-chip-on" : "")}
                          onClick={() => setRegionId(r.id)}
                          title={
                            r.reviewedBy
                              ? `复核人：${r.reviewedBy}`
                              : r.measurement
                                ? `测量人：${r.measurement.measuredBy}（待复核）`
                                : "待测"
                          }
                        >
                          <i style={{ background: STATUS_COLOR[r.status] }} />
                          {r.index}. {r.label}
                          {r.reviewedBy && <em>· {r.reviewedBy}核</em>}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="side-col">
                  <div className="panel">
                    <CalibrateForm
                      carpet={carpet}
                      onCalibrate={(scale, by) =>
                        run(() => archive.calibrate(carpet.id, scale, by), "比例已保存，可以圈选定损")
                      }
                    />
                    <ShrinkForm
                      carpet={carpet}
                      onRescale={(scale, by) =>
                        run(() => {
                          const r = archive.rescale(carpet.id, scale, by);
                          notify(
                            `新比例已应用：${r.invalidated} 个区域失效退回待测，${r.paused} 个区域暂停`,
                          );
                        })
                      }
                    />
                  </div>
                  <div className="panel">
                    <RegionPanel
                      carpet={carpet}
                      region={region}
                      onMeasure={(rid, by) =>
                        run(() => archive.measure(carpet.id, rid, by), "尺寸已按当前比例计算，等待复核")
                      }
                      onReview={(rid, by, approve) =>
                        run(
                          () => archive.review(carpet.id, rid, by, approve),
                          approve ? "复核通过，可以安排补线" : "已退回待测",
                        )
                      }
                      onStart={(rid, by) =>
                        run(() => archive.start(carpet.id, rid, by), "已开工补线")
                      }
                      onComplete={(rid, by) =>
                        run(() => archive.complete(carpet.id, rid, by), "已登记完工，记录永久保留")
                      }
                      onRemove={(rid) =>
                        run(() => {
                          archive.removeRegion(carpet.id, rid);
                          setRegionId(null);
                        }, "区域已删除")
                      }
                      onMeta={(rid, patch) =>
                        run(() => archive.updateRegionMeta(carpet.id, rid, patch))
                      }
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {toast && <div className={"toast toast-" + toast.kind}>{toast.msg}</div>}
    </main>
  );
}

/* ------------------------------- 小组件 ------------------------------- */

function Metric({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <article>
      <small>{label}</small>
      <strong style={{ color: tone }}>
        {value}
        {unit && <em> {unit}</em>}
      </strong>
    </article>
  );
}

function ScaleBadge({ carpet }: { carpet: Carpet }) {
  if (!carpet.scale) {
    return <span className="scale-badge scale-badge-off">比例未录入</span>;
  }
  return (
    <span className="scale-badge">
      纬 {carpet.scale.pxPerCmX} px/cm · 经 {carpet.scale.pxPerCmY} px/cm
    </span>
  );
}

function CarpetCard({
  carpet,
  active,
  onSelect,
}: {
  carpet: Carpet;
  active: boolean;
  onSelect: () => void;
}) {
  const s = summarizeRegions(carpet.regions);
  return (
    <button className={"carpet-card" + (active ? " carpet-card-on" : "")} onClick={onSelect}>
      <div className="carpet-card-row">
        <b>{carpet.id}</b>
        <span className="origin-mini">{carpet.origin}</span>
      </div>
      <small>{carpet.material || "材质未录"} · {carpet.dyeType || "染色未录"}</small>
      <div className="mini-bar">
        {(Object.keys(STATUS_LABEL) as RegionStatus[])
          .filter((st) => s.byStatus[st] > 0)
          .map((st) => (
            <span
              key={st}
              title={STATUS_LABEL[st]}
              style={{
                background: STATUS_COLOR[st],
                flexGrow: s.byStatus[st],
              }}
            />
          ))}
      </div>
      <div className="mini-legend">
        {s.total === 0 ? (
          <span className="muted">无定损区域</span>
        ) : (
          <>
            <span>{s.total} 个区域</span>
            <span>{Math.round(s.doneRate * 100)}% 完工</span>
          </>
        )}
      </div>
    </button>
  );
}

function NewCarpetForm({ onCreate }: { onCreate: (input: {
  origin: string;
  era: string;
  knotDensity: string;
  material: string;
  dyeType: string;
}) => void }) {
  const [form, setForm] = useState({
    origin: "波斯",
    era: "",
    knotDensity: "",
    material: "",
    dyeType: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="new-form">
      <label>
        <span>产地 *</span>
        <input value={form.origin} onChange={set("origin")} placeholder="波斯 / 安纳托利亚 / 高加索 / 藏毯" />
      </label>
      <label>
        <span>年代</span>
        <input value={form.era} onChange={set("era")} placeholder="如 约1960s" />
      </label>
      <label>
        <span>结密度</span>
        <input value={form.knotDensity} onChange={set("knotDensity")} placeholder="如 38 结/平方英寸" />
      </label>
      <label>
        <span>材质</span>
        <input value={form.material} onChange={set("material")} placeholder="羊毛 / 棉 / 丝" />
      </label>
      <label>
        <span>染色类型</span>
        <input value={form.dyeType} onChange={set("dyeType")} placeholder="植物染 / 化学染" />
      </label>
      <button
        className="primary"
        onClick={() => {
          if (!form.origin.trim()) return;
          onCreate(form);
        }}
      >
        建立档案
      </button>
    </div>
  );
}

export default App;
