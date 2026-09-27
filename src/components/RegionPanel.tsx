import { useEffect, useState } from "react";
import type { Carpet } from "../storage/archiveStore";
import {
  MEASUREMENT_RULES,
  round1,
  STATUS_COLOR,
  STATUS_LABEL,
  type MeasureSnapshot,
  type Region,
} from "../rules/measurement";

interface Props {
  carpet: Carpet;
  region: Region | null;
  onMeasure: (regionId: string, by: string) => void;
  onReview: (regionId: string, by: string, approve: boolean) => void;
  onStart: (regionId: string, by: string) => void;
  onComplete: (regionId: string, by: string) => void;
  onRemove: (regionId: string) => void;
  onMeta: (regionId: string, patch: Pick<Region, "label" | "yarnColor" | "note">) => void;
}

export function RegionPanel(props: Props) {
  const { carpet, region } = props;
  const [name, setName] = useState("");
  const [reviewer, setReviewer] = useState("");

  useEffect(() => {
    setName("");
    setReviewer("");
  }, [region?.id]);

  if (!region) {
    return (
      <div className="region-panel empty">
        <h3>破损区域</h3>
        <p className="muted">
          {carpet.scale
            ? "在左侧纹样图上拖动圈选破损区域，或点击已有框查看尺寸。"
            : "请先完成比例录入。"}
        </p>
      </div>
    );
  }

  const m = region.measurement;
  const measuredBy = m?.measuredBy;

  return (
    <div className="region-panel">
      <div className="region-head">
        <span className="status-badge" style={{ background: STATUS_COLOR[region.status] }}>
          {STATUS_LABEL[region.status]}
        </span>
        {region.invalidationCount > 0 && (
          <span className="invalidate-tag">已失效重测 {region.invalidationCount} 次</span>
        )}
      </div>

      <label className="meta-input">
        <span>区域名称</span>
        <input
          defaultValue={region.label}
          onBlur={(e) => e.target.value !== region.label && props.onMeta(region.id, { label: e.target.value, yarnColor: region.yarnColor, note: region.note })}
        />
      </label>

      {/* 尺寸结果 */}
      <div className="dims">
        <Dim label="纬向宽度" value={m ? round1(m.widthCm) : null} unit="cm" />
        <Dim label="经向长度" value={m ? round1(m.lengthCm) : null} unit="cm" />
        <Dim label="面积" value={m ? round1(m.areaCm2) : null} unit="cm²" />
        <Dim label="周长" value={m ? round1(m.perimeterCm) : null} unit="cm" />
        <Dim label="所需补线" value={m ? round1(m.yarnCm) : null} unit="cm" highlight />
      </div>

      {region.status === "paused" && region.staleMeasurement && (
        <div className="stale-box">
          <strong>缩水后比例已变，以下为暂停前的旧尺寸（仅供对照）：</strong>
          <StaleDims m={region.staleMeasurement} />
          <span>重新测量并经另一名师傅复核后，方可继续裁补线。</span>
        </div>
      )}

      {!m && region.status === "pending" && (
        <div className="action-box">
          <p className="muted">
            区域已圈出（{Math.round(region.rect.width)} × {Math.round(region.rect.height)} 像素），
            按当前比例计算实际尺寸：
          </p>
          <label>
            <span>测量 / 录入师傅</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="由谁测量" />
          </label>
          <button className="primary" onClick={() => props.onMeasure(region.id, name)}>
            计算长宽 / 面积 / 补线长度
          </button>
        </div>
      )}

      {/* 已测待复核 */}
      {region.status === "measured" && m && (
        <div className="action-box review-box">
          <p>
            测量人：<b>{m.measuredBy}</b>（{new Date(m.measuredAt).toLocaleString()}）
          </p>
          <p className="rule-note">
            ⚠ 进入补线前必须由<b>另一名师傅</b>复核尺寸，复核人不得与测量人相同。
          </p>
          <label>
            <span>复核师傅姓名</span>
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder={measuredBy ? `不能填 ${measuredBy}` : "另一名师傅"}
            />
          </label>
          <div className="btn-row">
            <button className="primary" onClick={() => props.onReview(region.id, reviewer, true)}>
              复核通过
            </button>
            <button onClick={() => props.onReview(region.id, reviewer, false)}>尺寸有误，退回待测</button>
          </div>
          <button className="link-btn" onClick={() => props.onMeasure(region.id, name || m.measuredBy)}>
            尺寸有误？由测量人重新计算
          </button>
        </div>
      )}

      {/* 已复核 */}
      {region.status === "reviewed" && (
        <div className="action-box">
          <p className="ok-note">
            ✓ 已由 <b>{region.reviewedBy}</b> 于 {new Date(region.reviewedAt!).toLocaleString()} 复核通过，
            可开工裁补线。
          </p>
          <label>
            <span>开工师傅</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="由谁补线" />
          </label>
          <button className="primary" onClick={() => props.onStart(region.id, name)}>
            开始补线
          </button>
        </div>
      )}

      {/* 补线中 */}
      {region.status === "active" && (
        <div className="action-box">
          <p className="ok-note">
            补线进行中（{new Date(region.startedAt!).toLocaleDateString()} 开工）。
          </p>
          <label>
            <span>完工登记人</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="登记完工师傅" />
          </label>
          <button className="primary" onClick={() => props.onComplete(region.id, name)}>
            登记完工
          </button>
        </div>
      )}

      {region.status === "done" && (
        <div className="action-box">
          <p className="ok-note">
            ✓ {new Date(region.completedAt!).toLocaleString()} 完工，尺寸与复核记录永久保留。
          </p>
        </div>
      )}

      {/* 暂停区域重测入口 */}
      {region.status === "paused" && (
        <div className="action-box">
          <label>
            <span>重测师傅</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="按新比例重测的师傅" />
          </label>
          <button className="primary" onClick={() => props.onMeasure(region.id, name)}>
            按新比例重新计算尺寸
          </button>
          <p className="muted">重测后仍需另一名师傅复核才能恢复开工。</p>
        </div>
      )}

      {/* 补线颜色 / 备注 */}
      <div className="meta-grid">
        <label className="meta-input">
          <span>补线颜色（色卡）</span>
          <input
            defaultValue={region.yarnColor}
            placeholder="如 色卡 P-14 赭红"
            onBlur={(e) =>
              props.onMeta(region.id, { label: region.label, yarnColor: e.target.value, note: region.note })
            }
          />
        </label>
        <label className="meta-input">
          <span>备注</span>
          <input
            defaultValue={region.note}
            placeholder="工艺注意事项"
            onBlur={(e) =>
              props.onMeta(region.id, { label: region.label, yarnColor: region.yarnColor, note: e.target.value })
            }
          />
        </label>
      </div>

      <details className="history">
        <summary>操作与复核记录（{region.history.length} 条）</summary>
        <ol>
          {[...region.history].reverse().map((h, i) => (
            <li key={i}>
              {new Date(h.at).toLocaleString()} · {HISTORY_LABEL[h.kind] ?? h.kind} · {h.by}
              {h.note ? `（${h.note}）` : ""}
            </li>
          ))}
        </ol>
        <p className="muted rule-foot">
          核算规则：补线长度 = 周长 × {MEASUREMENT_RULES.yarnPerimeterFactor} + 面积 ×{" "}
          {MEASUREMENT_RULES.yarnPerAreaFactor}（cm，规则集中在 src/rules/measurement.ts）。
        </p>
      </details>

      {region.status !== "done" && region.status !== "active" && (
        <button className="link-btn danger-text" onClick={() => props.onRemove(region.id)}>
          删除此区域（完工记录不可删除）
        </button>
      )}
    </div>
  );
}

const HISTORY_LABEL: Record<string, string> = {
  created: "圈选建档",
  measured: "提交尺寸",
  reviewed: "复核通过",
  rejected: "复核退回",
  started: "开工补线",
  completed: "登记完工",
  invalidated: "尺寸失效退回待测",
  paused: "缩水暂停",
  resumed: "申请重测",
  rescaled: "重新定标",
  deleted: "删除",
};

function Dim({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number | null;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div className={"dim" + (highlight ? " dim-hl" : "")}>
      <small>{label}</small>
      <strong>
        {value === null ? "—" : value}
        <em>{unit}</em>
      </strong>
    </div>
  );
}

function StaleDims({ m }: { m: MeasureSnapshot }) {
  return (
    <p className="stale-dims">
      旧纬宽 {round1(m.widthCm)}cm · 旧经长 {round1(m.lengthCm)}cm · 旧面积{" "}
      {round1(m.areaCm2)}cm² · 旧补线 {round1(m.yarnCm)}cm
    </p>
  );
}
