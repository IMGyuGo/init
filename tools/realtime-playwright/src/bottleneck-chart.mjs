const WIDTH = 1600;
const HEIGHT = 1200;
const BOUNDS = { left: 120, right: 1480, width: 1360, height: 220 };

export function buildStageChartHtml({ summary, series } = {}) {
  assertStageChartInput(summary, series);
  const panels = [
    renderPanel({
      key: "api",
      title: "API latency / error rate",
      y: 210,
      summary,
      lines: [
        renderLine(series.apiP95Ms, summary, "#2563eb", "api-p95", scaleFor(series.apiP95Ms, 210)),
        renderLine(series.apiErrorRatePercent, summary, "#dc2626", "api-error-rate", percentScale(210)),
      ],
      missing: missingLabel(summary, [
        "api.p95Ms", "api.errorRatePercent", "api.target4xx", "api.target5xx", "api.connectionErrors",
      ]),
    }),
    renderPanel({
      key: "ecs",
      title: "ECS API maximum CPU (%)",
      y: 520,
      summary,
      lines: [renderLine(series.ecsCpuMaximum, summary, "#f59e0b", "ecs-cpu-max", percentScale(520))],
      missing: missingLabel(summary, ["ecsApi.maximumCpuPercent", "ecsApi.taskAnomaly"]),
    }),
    renderPanel({
      key: "db",
      title: "RDS CPU credit balance",
      y: 830,
      summary,
      lines: [renderLine(series.dbCpuCredit, summary, "#16a34a", "db-cpu-credit", scaleFor(series.dbCpuCredit, 830))],
      missing: missingLabel(summary, ["dbCpuCredit"]),
    }),
  ];

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>
html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;background:#f8fafc;font-family:Arial,"Malgun Gothic",sans-serif;color:#0f172a}
svg{display:block}.panel{fill:#fff;stroke:#cbd5e1;stroke-width:2}.grid{stroke:#e2e8f0;stroke-width:1}.marker{stroke:#64748b;stroke-width:2;stroke-dasharray:7 6}.axis{fill:#475569;font-size:18px}.title{font-size:24px;font-weight:700}.missing{fill:#b91c1c;font-size:20px;font-weight:700}.meta{fill:#334155;font-size:21px}.verdict{font-size:30px;font-weight:800}
</style></head><body><svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="bottleneck stage chart">
${renderHeader(summary)}${panels.join("")}
</svg></body></html>`;
}

export function assertPngSize(buffer, width = WIDTH, height = HEIGHT) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24
    || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    || buffer.readUInt32BE(16) !== width || buffer.readUInt32BE(20) !== height) {
    throw new Error("invalid bottleneck PNG");
  }
}

function renderHeader(summary) {
  const statusColor = summary.verdict.startsWith("PASS") ? "#15803d" : "#b91c1c";
  return `<g data-section="header">
  <text x="80" y="64" class="title">nGrinder + Playwright bottleneck evidence</text>
  <text x="80" y="108" class="meta">stage ${escapeXml(summary.stage)} · attempt ${escapeXml(summary.attempt)} · users ${escapeXml(summary.users.completed)}/${escapeXml(summary.users.target)} (${escapeXml(summary.users.successRatePercent)}%)</text>
  <text x="80" y="142" class="meta">UTC ${escapeXml(summary.startedAtUtc)} — ${escapeXml(summary.endedAtUtc)}</text>
  <text x="80" y="174" class="meta">KST ${escapeXml(summary.startedAtKst)} — ${escapeXml(summary.endedAtKst)}</text>
  <text x="1520" y="70" text-anchor="end" class="verdict" fill="${statusColor}">${escapeXml(summary.verdict)}</text>
</g>`;
}

function renderPanel({ key, title, y, summary, lines, missing }) {
  const startX = BOUNDS.left;
  const endX = BOUNDS.right;
  const bottom = y + BOUNDS.height;
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => `<line class="grid" x1="${startX}" y1="${round(y + ratio * BOUNDS.height)}" x2="${endX}" y2="${round(y + ratio * BOUNDS.height)}"/>`)
    .join("");
  return `<g data-panel="${key}">
  <rect class="panel" x="70" y="${y - 30}" width="1460" height="280" rx="12"/>
  <text x="90" y="${y - 15}" class="title">${escapeXml(title)}</text>
  ${grid}
  <line data-axis="time" x1="${startX}" y1="${bottom}" x2="${endX}" y2="${bottom}" stroke="#64748b" stroke-width="2"/>
  <line data-marker="stage-start" class="marker" x1="${startX}" y1="${y}" x2="${startX}" y2="${bottom}"/>
  <line data-marker="stage-end" class="marker" x1="${endX}" y1="${y}" x2="${endX}" y2="${bottom}"/>
  <text x="${startX}" y="${bottom + 27}" class="axis">${escapeXml(timeLabel(summary.startedAtUtc))}</text>
  <text x="${endX}" y="${bottom + 27}" text-anchor="end" class="axis">${escapeXml(timeLabel(summary.endedAtUtc))}</text>
  ${lines.join("")}
  ${missing ? `<text x="800" y="${y + 118}" text-anchor="middle" class="missing">${escapeXml(missing)}</text>` : ""}
</g>`;
}

function renderLine(points, summary, color, key, yScale) {
  if (points.length === 0) return "";
  const start = Date.parse(summary.startedAtUtc);
  const end = Date.parse(summary.endedAtUtc);
  const coordinates = points.map(({ atUtc, value }) => {
    const ratio = Math.max(0, Math.min(1, (Date.parse(atUtc) - start) / (end - start)));
    return `${round(BOUNDS.left + ratio * BOUNDS.width)},${round(yScale(value))}`;
  });
  return `<polyline data-series="${key}" points="${coordinates.join(" ")}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function scaleFor(points, panelY) {
  const values = points.map(({ value }) => value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.1, Math.abs(max) * 0.01, 1);
  const paddedMin = Math.max(0, min - padding);
  const paddedMax = max + padding;
  return value => panelY + BOUNDS.height - ((value - paddedMin) / (paddedMax - paddedMin)) * BOUNDS.height;
}

function percentScale(panelY) {
  return value => panelY + BOUNDS.height - Math.max(0, Math.min(100, value)) / 100 * BOUNDS.height;
}

function missingLabel(summary, metrics) {
  const reasons = summary.missingMetrics
    .filter(({ metric }) => metrics.includes(metric))
    .map(({ reason }) => reason);
  return reasons.length > 0 ? `필수 지표 누락: ${[...new Set(reasons)].join(", ")}` : "";
}

function assertStageChartInput(summary, series) {
  if (!summary || !series || !summary.users || !Array.isArray(summary.missingMetrics)) {
    throw new Error("invalid bottleneck chart input");
  }
  const start = Date.parse(summary.startedAtUtc);
  const end = Date.parse(summary.endedAtUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("invalid bottleneck chart input");
  }
  for (const key of ["apiP95Ms", "apiErrorRatePercent", "ecsCpuMaximum", "dbCpuCredit"]) {
    if (!Array.isArray(series[key])) throw new Error("invalid bottleneck chart input");
    for (const point of series[key]) {
      if (!Number.isFinite(Date.parse(point?.atUtc)) || !Number.isFinite(point?.value) || point.value < 0) {
        throw new Error("invalid bottleneck chart input");
      }
    }
  }
}

function timeLabel(value) {
  return new Date(value).toISOString().slice(11, 19) + " UTC";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function round(value) {
  return Math.round(value * 100) / 100;
}
