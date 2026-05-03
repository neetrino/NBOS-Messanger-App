import {
  CLIP_BRAND_BODY_PATH,
  CLIP_BRAND_BROW_PATHS,
  CLIP_BRAND_BROW_STROKE_WIDTH,
  CLIP_BRAND_EYES,
  CLIP_BRAND_STROKE_WIDTH,
  CLIP_BRAND_VIEWBOX,
  CLIP_BRAND_BADGE_BG,
  CLIP_BRAND_BADGE_BORDER,
} from "@app-messenger/shared";

export type ClipBrandIconProps = {
  className?: string;
  /** Ignored when width/height are provided via className */
  size?: number;
  title?: string;
};

export function ClipBrandIcon({
  className,
  size = 20,
  title,
}: ClipBrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={CLIP_BRAND_VIEWBOX}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d={CLIP_BRAND_BODY_PATH}
        stroke="currentColor"
        strokeWidth={CLIP_BRAND_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {CLIP_BRAND_EYES.map((eye) => (
        <circle
          key={`${eye.cx}-${eye.cy}`}
          cx={eye.cx}
          cy={eye.cy}
          r={eye.r}
          fill="currentColor"
        />
      ))}
      {CLIP_BRAND_BROW_PATHS.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={CLIP_BRAND_BROW_STROKE_WIDTH}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export type ClipBrandBadgeProps = {
  className?: string;
  iconClassName?: string;
  iconSize?: number;
  title?: string;
};

export function ClipBrandBadge({
  className,
  iconClassName,
  iconSize = 28,
  title = "Messenger",
}: ClipBrandBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1.5 ${className ?? ""}`}
      style={{
        backgroundColor: CLIP_BRAND_BADGE_BG,
        borderColor: CLIP_BRAND_BADGE_BORDER,
      }}
    >
      <ClipBrandIcon
        className={`text-white ${iconClassName ?? ""}`}
        size={iconSize}
        title={title}
      />
    </span>
  );
}
