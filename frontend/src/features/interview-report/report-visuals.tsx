"use client";

import { useState } from "react";

// 실전(기업) 리포트와 모의면접 리포트가 공유하는 점수 시각화. (#289)
// 게이지·역량 레이더·역량 밴드 헬퍼를 한 곳에서 관리해 두 화면 UI를 일치시킨다.

const RADAR_VIEW_WIDTH = 460;
const RADAR_VIEW_HEIGHT = 340;
const RADAR_CX = 230;
const RADAR_CY = 170;
const RADAR_RADIUS = 104;

export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function scoreBand(score: number | null): { label: string; tone: "high" | "mid" | "low" | "min" } | null {
  if (score == null) return null;
  if (score >= 80) return { label: "우수", tone: "high" };
  if (score >= 60) return { label: "양호", tone: "mid" };
  if (score >= 40) return { label: "보통", tone: "low" };
  return { label: "미흡", tone: "min" };
}

export type CompetencyTone = "high" | "good" | "mid" | "low";

export function competencyBand(score: number): { label: string; tone: CompetencyTone } {
  if (score >= 80) return { label: "우수", tone: "high" };
  if (score >= 65) return { label: "양호", tone: "good" };
  if (score >= 50) return { label: "보통", tone: "mid" };
  return { label: "미흡", tone: "low" };
}

// 레이더가 그리는 항목. 실전 profiles/레거시 scores/모의 scores 를 같은 모양으로 주입한다. (#289)
export type RadarItem = {
  id: number;
  name: string;
  value: number; // 0~100
  cutline: number | null; // 0~100, 전 항목 존재 시에만 점선 표시
};

// 원형 게이지. score(0~100)와 톤, 합격선 마커(cutScore)를 받는다. (#289)
export function ReportGauge({
  score,
  tone = "accent",
  cutScore = null,
  valueLabel = "최종 점수",
  emptyLabel = "점수 산정 불가",
}: {
  score: number | null;
  tone?: string;
  cutScore?: number | null;
  valueLabel?: string;
  emptyLabel?: string;
}) {
  const scorePercent = score == null ? null : clampPercent(score);
  return (
    <div
      className={`report-gauge gauge-${tone}`}
      role="img"
      aria-label={score == null ? "종합 점수 없음" : `최종 점수 ${score}점`}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="report-gauge-track" cx="60" cy="60" r="52" />
        {scorePercent != null ? (
          <circle
            className="report-gauge-fill"
            cx="60"
            cy="60"
            r="52"
            strokeDasharray={`${(scorePercent / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
          />
        ) : null}
        {cutScore != null
          ? (() => {
              // 합격선 마커. svg 전체가 -90도 회전되어 있어 0도가 12시 방향이다. (#289)
              const cutAngle = (clampPercent(cutScore) / 100) * 2 * Math.PI;
              const cos = Math.cos(cutAngle);
              const sin = Math.sin(cutAngle);
              return (
                <line
                  className="report-gauge-cutline"
                  x1={60 + 45 * cos}
                  y1={60 + 45 * sin}
                  x2={60 + 59 * cos}
                  y2={60 + 59 * sin}
                />
              );
            })()
          : null}
      </svg>
      <div className="report-gauge-value">
        <strong>{score ?? "—"}</strong>
        <span>{score == null ? emptyLabel : valueLabel}</span>
      </div>
    </div>
  );
}

// 역량별 레이더 그래프. 축 개수는 항목 수에 따라 동적(NCS 3역량 → 삼각형). (#289)
export function CompetencyRadar({
  items,
  selectedId,
  onSelect,
}: {
  items: RadarItem[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const count = items.length;
  const angleAt = (index: number) => ((-90 + (360 / count) * index) * Math.PI) / 180;
  const pointAt = (index: number, r: number): [number, number] => [
    RADAR_CX + r * Math.cos(angleAt(index)),
    RADAR_CY + r * Math.sin(angleAt(index)),
  ];
  const ringPoints = (r: number) =>
    items.map((_, index) => pointAt(index, r).map((value) => value.toFixed(1)).join(",")).join(" ");
  const dataPoints = items.map((item, index) => pointAt(index, (RADAR_RADIUS * clampPercent(item.value)) / 100));
  const hasCutline = items.every((item) => item.cutline != null);
  const cutlinePoints = hasCutline
    ? items
        .map((item, index) =>
          pointAt(index, (RADAR_RADIUS * clampPercent(item.cutline ?? 0)) / 100)
            .map((value) => value.toFixed(1))
            .join(","),
        )
        .join(" ")
    : null;

  return (
    <svg className="report-radar" viewBox={`0 0 ${RADAR_VIEW_WIDTH} ${RADAR_VIEW_HEIGHT}`} role="img" aria-label="역량별 점수 그래프">
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <polygon key={fraction} className="report-radar-ring" points={ringPoints(RADAR_RADIUS * fraction)} />
      ))}
      {items.map((item, index) => {
        const [x, y] = pointAt(index, RADAR_RADIUS);
        const isHot = item.id === hoveredId || item.id === selectedId;
        return (
          <line key={item.id} className={`report-radar-axis${isHot ? " is-hot" : ""}`} x1={RADAR_CX} y1={RADAR_CY} x2={x} y2={y} />
        );
      })}
      {cutlinePoints ? <polygon className="report-radar-cutline" points={cutlinePoints} /> : null}
      <g className="report-radar-shape">
        <polygon
          className="report-radar-area"
          points={dataPoints.map((point) => point.map((value) => value.toFixed(1)).join(",")).join(" ")}
        />
        {dataPoints.map((point, index) => {
          const isSelected = items[index].id === selectedId;
          const isHovered = items[index].id === hoveredId;
          return (
            <g key={items[index].id}>
              {isSelected || isHovered ? <circle className="report-radar-halo" cx={point[0]} cy={point[1]} r={13} /> : null}
              <circle
                className={`report-radar-dot${isSelected ? " is-selected" : ""}`}
                cx={point[0]}
                cy={point[1]}
                r={isSelected ? 6 : isHovered ? 5.5 : 4}
                onClick={() => onSelect(items[index].id)}
                onMouseEnter={() => setHoveredId(items[index].id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            </g>
          );
        })}
      </g>
      {items.map((item, index) => {
        const [labelX, labelY] = pointAt(index, RADAR_RADIUS + 24);
        const cos = Math.cos(angleAt(index));
        const sin = Math.sin(angleAt(index));
        const anchor = Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end";
        const baseY = sin < -0.35 ? labelY - 14 : labelY;
        const isSelected = item.id === selectedId;
        const isHovered = item.id === hoveredId;
        return (
          <g
            key={item.id}
            className={`report-radar-label${isSelected ? " is-selected" : ""}${isHovered ? " is-hot" : ""}`}
            onClick={() => onSelect(item.id)}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <text x={labelX} y={baseY} textAnchor={anchor}>
              <tspan className="report-radar-label-name" x={labelX} dy="0">
                {item.name}
              </tspan>
              <tspan className="report-radar-label-score" x={labelX} dy="16">
                {item.value}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
