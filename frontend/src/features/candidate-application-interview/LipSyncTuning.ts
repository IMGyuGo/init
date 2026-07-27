"use client";

import { useEffect, useState } from "react";

export interface LipSyncTuningSettings {
  timelineOffsetMs: number;
  minimumShapeHoldMs: number;
  silenceHangoverMs: number;
  fullOpenEnterThreshold: number;
  fullOpenExitThreshold: number;
}

export const DEFAULT_LIP_SYNC_TUNING_SETTINGS: LipSyncTuningSettings = {
  timelineOffsetMs: 0,
  minimumShapeHoldMs: 80,
  silenceHangoverMs: 60,
  fullOpenEnterThreshold: 0.58,
  fullOpenExitThreshold: 0.42,
};

export const LIP_SYNC_TUNING_STORAGE_KEY = "candidate.interviewer-lip-sync-tuning.v1";
export const LIP_SYNC_TUNING_CHANGE_EVENT = "candidate:interviewer-lip-sync-tuning-change";

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stepped(value: number, min: number, max: number, step: number, digits = 0): number {
  const clamped = Math.min(max, Math.max(min, value));
  return Number((Math.round(clamped / step) * step).toFixed(digits));
}

export function normalizeLipSyncTuningSettings(
  value: Partial<LipSyncTuningSettings> | null | undefined,
): LipSyncTuningSettings {
  const input = value ?? {};
  const fullOpenEnterThreshold = stepped(
    numeric(
      input.fullOpenEnterThreshold,
      DEFAULT_LIP_SYNC_TUNING_SETTINGS.fullOpenEnterThreshold,
    ),
    0.45,
    0.75,
    0.01,
    2,
  );
  const requestedExitThreshold = stepped(
    numeric(
      input.fullOpenExitThreshold,
      DEFAULT_LIP_SYNC_TUNING_SETTINGS.fullOpenExitThreshold,
    ),
    0.25,
    0.6,
    0.01,
    2,
  );

  return {
    timelineOffsetMs: stepped(
      numeric(input.timelineOffsetMs, DEFAULT_LIP_SYNC_TUNING_SETTINGS.timelineOffsetMs),
      -200,
      200,
      10,
    ),
    minimumShapeHoldMs: stepped(
      numeric(
        input.minimumShapeHoldMs,
        DEFAULT_LIP_SYNC_TUNING_SETTINGS.minimumShapeHoldMs,
      ),
      60,
      120,
      10,
    ),
    silenceHangoverMs: stepped(
      numeric(
        input.silenceHangoverMs,
        DEFAULT_LIP_SYNC_TUNING_SETTINGS.silenceHangoverMs,
      ),
      0,
      150,
      10,
    ),
    fullOpenEnterThreshold,
    fullOpenExitThreshold: Math.min(
      requestedExitThreshold,
      Number((fullOpenEnterThreshold - 0.05).toFixed(2)),
    ),
  };
}

export function readLipSyncTuningSettings(
  storage: ReadStorage | null | undefined,
): LipSyncTuningSettings {
  if (!storage) return DEFAULT_LIP_SYNC_TUNING_SETTINGS;

  try {
    const rawValue = storage.getItem(LIP_SYNC_TUNING_STORAGE_KEY);
    if (!rawValue) return DEFAULT_LIP_SYNC_TUNING_SETTINGS;

    const parsed = JSON.parse(rawValue) as { version?: unknown; settings?: unknown };
    if (parsed.version !== 1 || !parsed.settings || typeof parsed.settings !== "object") {
      return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
    }

    return normalizeLipSyncTuningSettings(
      parsed.settings as Partial<LipSyncTuningSettings>,
    );
  } catch {
    return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
  }
}

export function writeLipSyncTuningSettings(
  storage: WriteStorage,
  value: Partial<LipSyncTuningSettings>,
): LipSyncTuningSettings {
  const settings = normalizeLipSyncTuningSettings(value);
  storage.setItem(
    LIP_SYNC_TUNING_STORAGE_KEY,
    JSON.stringify({ version: 1, settings }),
  );
  return settings;
}

export function resetLipSyncTuningSettings(storage: WriteStorage): LipSyncTuningSettings {
  storage.removeItem(LIP_SYNC_TUNING_STORAGE_KEY);
  return DEFAULT_LIP_SYNC_TUNING_SETTINGS;
}

export function saveLipSyncTuningSettings(
  value: Partial<LipSyncTuningSettings>,
  storage: WriteStorage = window.localStorage,
  eventTarget: EventTarget = window,
): LipSyncTuningSettings {
  const settings = writeLipSyncTuningSettings(storage, value);
  eventTarget.dispatchEvent(new Event(LIP_SYNC_TUNING_CHANGE_EVENT));
  return settings;
}

export function clearLipSyncTuningSettings(
  storage: WriteStorage = window.localStorage,
  eventTarget: EventTarget = window,
): LipSyncTuningSettings {
  const settings = resetLipSyncTuningSettings(storage);
  eventTarget.dispatchEvent(new Event(LIP_SYNC_TUNING_CHANGE_EVENT));
  return settings;
}

export function useStoredLipSyncTuningSettings(): LipSyncTuningSettings {
  const [settings, setSettings] = useState(DEFAULT_LIP_SYNC_TUNING_SETTINGS);

  useEffect(() => {
    const sync = () => setSettings(readLipSyncTuningSettings(window.localStorage));
    const syncStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === LIP_SYNC_TUNING_STORAGE_KEY) sync();
    };

    sync();
    window.addEventListener("storage", syncStorage);
    window.addEventListener(LIP_SYNC_TUNING_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", syncStorage);
      window.removeEventListener(LIP_SYNC_TUNING_CHANGE_EVENT, sync);
    };
  }, []);

  return settings;
}

