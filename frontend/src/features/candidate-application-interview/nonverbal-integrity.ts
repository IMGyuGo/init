import type { Detection, Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision";

export type GazeDirection = "LEFT" | "RIGHT" | "UP" | "DOWN";
export type GazeSignalSource = "IRIS" | "HEAD_POSE" | "COMBINED";

export type IrisGazePosition = {
  horizontalRatio: number;
  verticalRatio: number;
};

export type HeadPoseAngles = {
  yawDegrees: number;
  pitchDegrees: number;
};

export type CombinedGazeSignal = {
  direction: GazeDirection;
  source: GazeSignalSource;
  strength: number;
};

export const GAZE_CALIBRATION_REQUIRED_SAMPLES = 4;
export function countPersonDetections(detections: Detection[], minimumScore = 0.45): number {
  return detections.filter((detection) =>
    detection.categories.some((category) =>
      category.categoryName.toLowerCase() === "person" && category.score >= minimumScore,
    ),
  ).length;
}


export type MultiplePeopleDetectionState = {
  positiveSampleTimesMs: number[];
  lastDetectedAtMs?: number;
  active: boolean;
};

export function updateMultiplePeopleDetectionState(input: {
  detected: boolean;
  nowMs: number;
  positiveSampleTimesMs: number[];
  lastDetectedAtMs?: number;
  active: boolean;
  confirmationWindowMs?: number;
  requiredPositiveSamples?: number;
  releaseGraceMs?: number;
}): MultiplePeopleDetectionState {
  const confirmationWindowMs = input.confirmationWindowMs ?? 1500;
  const requiredPositiveSamples = input.requiredPositiveSamples ?? 2;
  const releaseGraceMs = input.releaseGraceMs ?? 1500;
  const positiveSampleTimesMs = input.positiveSampleTimesMs.filter(
    (sampleTimeMs) => sampleTimeMs <= input.nowMs && input.nowMs - sampleTimeMs <= confirmationWindowMs,
  );
  let lastDetectedAtMs = input.lastDetectedAtMs;

  if (input.detected) {
    if (positiveSampleTimesMs[positiveSampleTimesMs.length - 1] !== input.nowMs) {
      positiveSampleTimesMs.push(input.nowMs);
    }
    lastDetectedAtMs = input.nowMs;
  }

  const confirmed = positiveSampleTimesMs.length >= requiredPositiveSamples;
  const heldDuringBriefMiss =
    input.active &&
    lastDetectedAtMs !== undefined &&
    input.nowMs - lastDetectedAtMs <= releaseGraceMs;

  return {
    positiveSampleTimesMs,
    lastDetectedAtMs,
    active: confirmed || heldDuringBriefMiss,
  };
}

const IRIS_HORIZONTAL_AWAY_THRESHOLD = 0.12;
const IRIS_VERTICAL_AWAY_THRESHOLD = 0.14;
const HEAD_YAW_AWAY_THRESHOLD_DEGREES = 20;
const HEAD_PITCH_AWAY_THRESHOLD_DEGREES = 16;
const COMBINED_MIN_COMPONENT_STRENGTH = 0.4;
const COMBINED_AWAY_THRESHOLD = 1.1;

export function estimateIrisGazePosition(landmarks: NormalizedLandmark[]): IrisGazePosition | undefined {
  if (landmarks.length < 478) return undefined;

  const rightIris = averageLandmarks(landmarks, [468, 469, 470, 471, 472]);
  const leftIris = averageLandmarks(landmarks, [473, 474, 475, 476, 477]);
  const rightLeft = landmarks[33];
  const rightRight = landmarks[133];
  const rightTop = landmarks[159];
  const rightBottom = landmarks[145];
  const leftLeft = landmarks[362];
  const leftRight = landmarks[263];
  const leftTop = landmarks[386];
  const leftBottom = landmarks[374];
  if (!rightIris || !leftIris || !rightLeft || !rightRight || !rightTop || !rightBottom || !leftLeft || !leftRight || !leftTop || !leftBottom) {
    return undefined;
  }

  const rightMinX = Math.min(rightLeft.x, rightRight.x);
  const rightMaxX = Math.max(rightLeft.x, rightRight.x);
  const leftMinX = Math.min(leftLeft.x, leftRight.x);
  const leftMaxX = Math.max(leftLeft.x, leftRight.x);
  const rightMinY = Math.min(rightTop.y, rightBottom.y);
  const rightMaxY = Math.max(rightTop.y, rightBottom.y);
  const leftMinY = Math.min(leftTop.y, leftBottom.y);
  const leftMaxY = Math.max(leftTop.y, leftBottom.y);
  const rightWidth = rightMaxX - rightMinX;
  const leftWidth = leftMaxX - leftMinX;
  const rightHeight = rightMaxY - rightMinY;
  const leftHeight = leftMaxY - leftMinY;
  if (rightWidth <= 0 || leftWidth <= 0 || rightHeight <= 0 || leftHeight <= 0) return undefined;

  return {
    horizontalRatio: ((rightIris.x - rightMinX) / rightWidth + (leftIris.x - leftMinX) / leftWidth) / 2,
    verticalRatio: ((rightIris.y - rightMinY) / rightHeight + (leftIris.y - leftMinY) / leftHeight) / 2,
  };
}

export function estimateHeadPoseAngles(matrix: Matrix | undefined): HeadPoseAngles | undefined {
  if (!matrix || matrix.rows < 4 || matrix.columns < 4 || matrix.data.length < 16) return undefined;

  const elements = matrix.data;
  const scaleX = Math.hypot(elements[0], elements[1], elements[2]);
  const scaleY = Math.hypot(elements[4], elements[5], elements[6]);
  const scaleZ = Math.hypot(elements[8], elements[9], elements[10]);
  if (scaleX <= 0 || scaleY <= 0 || scaleZ <= 0) return undefined;

  const m13 = elements[8] / scaleZ;
  const m22 = elements[5] / scaleY;
  const m23 = elements[9] / scaleZ;
  const m32 = elements[6] / scaleY;
  const m33 = elements[10] / scaleZ;
  const yawRadians = Math.asin(clamp(m13, -1, 1));
  const pitchRadians = Math.abs(m13) < 0.9999999
    ? Math.atan2(-m23, m33)
    : Math.atan2(m32, m22);

  return {
    yawDegrees: radiansToDegrees(yawRadians),
    pitchDegrees: radiansToDegrees(pitchRadians),
  };
}

export function resolveCombinedGazeSignal(input: {
  irisPosition?: IrisGazePosition;
  irisBaseline?: IrisGazePosition;
  headPose?: HeadPoseAngles;
  headPoseBaseline?: HeadPoseAngles;
}): CombinedGazeSignal | undefined {
  const irisEvidence = input.irisPosition && input.irisBaseline
    ? resolveIrisEvidence(input.irisPosition, input.irisBaseline)
    : undefined;
  const headPoseEvidence = input.headPose && input.headPoseBaseline
    ? resolveHeadPoseEvidence(input.headPose, input.headPoseBaseline)
    : undefined;
  const irisAway = Boolean(irisEvidence && irisEvidence.strength >= 1);
  const headPoseAway = Boolean(headPoseEvidence && headPoseEvidence.strength >= 1);

  if (irisEvidence && headPoseEvidence && irisEvidence.direction === headPoseEvidence.direction) {
    const combinedStrength = irisEvidence.strength + headPoseEvidence.strength;
    const bothSupportDirection =
      Math.min(irisEvidence.strength, headPoseEvidence.strength) >= COMBINED_MIN_COMPONENT_STRENGTH;
    if (
      (irisAway || headPoseAway) && bothSupportDirection ||
      bothSupportDirection && combinedStrength >= COMBINED_AWAY_THRESHOLD
    ) {
      return {
        direction: irisEvidence.direction,
        source: "COMBINED",
        strength: combinedStrength,
      };
    }
  }

  if (irisAway && headPoseAway && irisEvidence && headPoseEvidence) {
    const strengthDifference = Math.abs(irisEvidence.strength - headPoseEvidence.strength);
    if (strengthDifference < COMBINED_MIN_COMPONENT_STRENGTH) return undefined;
    return irisEvidence.strength > headPoseEvidence.strength ? irisEvidence : headPoseEvidence;
  }
  if (irisAway) return irisEvidence;
  if (headPoseAway) return headPoseEvidence;
  return undefined;
}

function resolveIrisEvidence(position: IrisGazePosition, baseline: IrisGazePosition): CombinedGazeSignal | undefined {
  const horizontalDelta = position.horizontalRatio - baseline.horizontalRatio;
  const verticalDelta = position.verticalRatio - baseline.verticalRatio;
  const horizontalStrength = Math.abs(horizontalDelta) / IRIS_HORIZONTAL_AWAY_THRESHOLD;
  const verticalStrength = Math.abs(verticalDelta) / IRIS_VERTICAL_AWAY_THRESHOLD;
  if (horizontalStrength < 0.05 && verticalStrength < 0.05) return undefined;

  if (horizontalStrength >= verticalStrength) {
    return {
      direction: horizontalDelta < 0 ? "LEFT" : "RIGHT",
      source: "IRIS",
      strength: horizontalStrength,
    };
  }
  return {
    direction: verticalDelta < 0 ? "UP" : "DOWN",
    source: "IRIS",
    strength: verticalStrength,
  };
}

function resolveHeadPoseEvidence(headPose: HeadPoseAngles, baseline: HeadPoseAngles): CombinedGazeSignal | undefined {
  const yawDelta = normalizeAngleDegrees(headPose.yawDegrees - baseline.yawDegrees);
  const pitchDelta = normalizeAngleDegrees(headPose.pitchDegrees - baseline.pitchDegrees);
  const yawStrength = Math.abs(yawDelta) / HEAD_YAW_AWAY_THRESHOLD_DEGREES;
  const pitchStrength = Math.abs(pitchDelta) / HEAD_PITCH_AWAY_THRESHOLD_DEGREES;
  if (yawStrength < 0.05 && pitchStrength < 0.05) return undefined;

  if (yawStrength >= pitchStrength) {
    return {
      direction: yawDelta < 0 ? "LEFT" : "RIGHT",
      source: "HEAD_POSE",
      strength: yawStrength,
    };
  }
  return {
    direction: pitchDelta < 0 ? "UP" : "DOWN",
    source: "HEAD_POSE",
    strength: pitchStrength,
  };
}

function averageLandmarks(landmarks: NormalizedLandmark[], indexes: number[]): NormalizedLandmark | undefined {
  const points = indexes.map((index) => landmarks[index]).filter((point): point is NormalizedLandmark => Boolean(point));
  if (points.length !== indexes.length) return undefined;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
    visibility: points.reduce((sum, point) => sum + (point.visibility ?? 0), 0) / points.length,
  };
}

function normalizeAngleDegrees(value: number) {
  let normalized = value;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function radiansToDegrees(value: number) {
  return value * 180 / Math.PI;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
