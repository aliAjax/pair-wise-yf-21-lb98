import { useState } from "react";
import type { DamageRegion } from "../rules/types";
import { MASTERS, STATUS_LABEL, canDelete } from "../rules/workflow";
import { STATUS_COLORS } from "./PatternCanvas";
import { fmtTime } from "./format";

interface Props {
  region: DamageRegion;
  scaleReady: boolean;
  onMeasure(): void;
  onReview(reviewer: string): void;
  onReject(reviewer: string): void;
  onStart(): void;
  onFinish(): void;
  onDelete(): void;
}

export default function RegionDetail({
  region,
  scaleReady,
  onMeasure,
  onReview,
  onReject,
  onStart,
  onFinish,
  onDelete,
}: Props) {
  const [reviewer, setReviewer] = useState("");
  // 复核人候选：规则要求“另一名师傅”，直接排除测量人
  const candidates = MASTERS.filter((m) => m !== region.measuredBy);
  const d = region.dims;

  return (
    <div className="region-detail">
      <div className="region-head">
        <h3>{region.label}</h3>
        <span className="badge" style={{ background: STATUS_COLORS[region.status] }}>
          {STATUS_LABEL[region.status]}
        </span>
      </div>

      {d ? (
        <div className="dim-grid">
          <div>
            <small>长（经向）</small>
            <b>{d.heightCm} cm</b>
          </div>
          <div>
            <small>宽（纬向）</small>
            <b>{d.widthCm} cm</b>
          </div>
          <div>
            <small>面积</small>
            <b>{d.areaCm2} cm²</b>
          </div>
          <div>
            <small>需补线</small>
            <b>{d.threadM} m</b>
          </div>
        </div>
      ) : (
        <p className="dim-empty">
          暂无有效尺寸{scaleReady ? "，请按当前比例测量。" : "，请先在上方标定经纬比例。"}
        </p>
      )}

      {region.status === "paused" && (
        <p className="warn-line">
          比例已变化，上述为旧尺寸，已停用；按新比例复测后需另一名师傅重新复核。
        </p>
      )}

      <p className="people">
        测量人：{region.measuredBy ?? "—"}　·　复核人：{region.reviewedBy ?? "—"}
        {region.startedAt && <>　·　开工：{fmtTime(region.startedAt)}</>}
        {region.doneAt && <>　·　完工：{fmtTime(region.doneAt)}</>}
      </p>

      <div className="actions">
        {region.status === "pending" && (
          <button className="primary" disabled={!scaleReady} onClick={onMeasure}>
            按当前比例测量
          </button>
        )}

        {region.status === "measured" && (
          <>
            <select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">选择复核师傅（须非测量人）</option>
              {candidates.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              className="primary"
              disabled={!reviewer}
              onClick={() => onReview(reviewer)}
            >
              复核通过
            </button>
            <button disabled={!reviewer} onClick={() => onReject(reviewer)}>
              复核退回
            </button>
          </>
        )}

        {region.status === "reviewed" && (
          <button className="primary" onClick={onStart}>
            开工补线
          </button>
        )}

        {region.status === "paused" && (
          <button className="primary" disabled={!scaleReady} onClick={onMeasure}>
            按新比例复测并送复核
          </button>
        )}

        {region.status === "repairing" && (
          <button className="primary" onClick={onFinish}>
            完工归档
          </button>
        )}

        {region.status === "done" && (
          <span className="done-note">已完工，记录保留，不再改动。</span>
        )}

        {canDelete(region) && (
          <button className="danger" onClick={onDelete}>
            删除区域
          </button>
        )}
      </div>

      <details className="history" open={region.history.length <= 4}>
        <summary>流转记录（{region.history.length}）</summary>
        <ul>
          {region.history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <time>{fmtTime(h.at)}</time>
              <b>{h.by}</b>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
