import manifest from "./mouth-sprite-registration.json";

export type MouthSpriteVariant =
  | "rest"
  | "closed"
  | "open-small"
  | "open"
  | "wide-small"
  | "wide"
  | "round-small"
  | "round"
  | "teeth";

export interface MouthSpriteRegistration {
  x: number;
  y: number;
}

export const MOUTH_SPRITE_CANVAS = manifest.canvas;
export const MOUTH_SPRITE_REGISTRATION = manifest.variants as Record<
  MouthSpriteVariant,
  MouthSpriteRegistration
>;

export function getMouthSpriteRegistration(
  variant: MouthSpriteVariant,
): MouthSpriteRegistration {
  return MOUTH_SPRITE_REGISTRATION[variant] ?? { x: 0, y: 0 };
}

function toPercent(value: number, total: number): string {
  const percent = Math.round((value / total) * 100_000_000) / 1_000_000;
  return `${percent}%`;
}

export function getMouthSpriteRegistrationCss(variant: MouthSpriteVariant) {
  const registration = getMouthSpriteRegistration(variant);
  return {
    x: toPercent(registration.x, MOUTH_SPRITE_CANVAS.width),
    y: toPercent(registration.y, MOUTH_SPRITE_CANVAS.height),
  };
}
