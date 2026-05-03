/**
 * Vector data for the messenger “Clippy” paperclip mascot (24×24 artboard).
 * Stroke body is adapted from Lucide “paperclip” (MIT); eyes and brows are custom.
 */
export const CLIP_BRAND_VIEWBOX = "0 0 24 24" as const;

export const CLIP_BRAND_BODY_PATH =
  "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.48-8.48a4 4 0 0 1 5.66 5.66l-8.49 8.48a2 2 0 0 1-2.83-2.83l8.49-8.48" as const;

export const CLIP_BRAND_STROKE_WIDTH = 1.65 as const;

export const CLIP_BRAND_BROW_STROKE_WIDTH = 0.95 as const;

export const CLIP_BRAND_EYES = [
  { cx: 10.15, cy: 9.75, r: 0.92 },
  { cx: 14.35, cy: 9.75, r: 0.92 },
] as const satisfies readonly { cx: number; cy: number; r: number }[];

export const CLIP_BRAND_BROW_PATHS = [
  "M8.15 7.55 Q10.05 6.45 11.85 7.45",
  "M12.35 7.45 Q14.15 6.45 16.05 7.55",
] as const;

/** Pill badge colors matching the reference mockup */
export const CLIP_BRAND_BADGE_BG = "#1e2330" as const;
export const CLIP_BRAND_BADGE_BORDER = "#3d4d62" as const;
