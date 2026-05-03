import {
  CLIP_BRAND_BADGE_BG,
  CLIP_BRAND_BADGE_BORDER,
  CLIP_BRAND_BODY_PATH,
  CLIP_BRAND_BROW_PATHS,
  CLIP_BRAND_BROW_STROKE_WIDTH,
  CLIP_BRAND_EYES,
  CLIP_BRAND_STROKE_WIDTH,
  CLIP_BRAND_VIEWBOX,
} from "@app-messenger/shared";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

export type ClipBrandIconProps = {
  size: number;
  color: string;
};

export function ClipBrandIcon({ size, color }: ClipBrandIconProps) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={CLIP_BRAND_VIEWBOX}>
        <Path
          d={CLIP_BRAND_BODY_PATH}
          stroke={color}
          strokeWidth={CLIP_BRAND_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {CLIP_BRAND_EYES.map((eye) => (
          <Circle
            key={`${eye.cx}-${eye.cy}`}
            cx={eye.cx}
            cy={eye.cy}
            r={eye.r}
            fill={color}
          />
        ))}
        {CLIP_BRAND_BROW_PATHS.map((d) => (
          <Path
            key={d}
            d={d}
            stroke={color}
            strokeWidth={CLIP_BRAND_BROW_STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

export type ClipBrandBadgeProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function ClipBrandBadge({ size = 44, style }: ClipBrandBadgeProps) {
  const inner = Math.round(size * 0.55);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: CLIP_BRAND_BADGE_BG,
          borderWidth: 1,
          borderColor: CLIP_BRAND_BADGE_BORDER,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <ClipBrandIcon size={inner} color="#ffffff" />
    </View>
  );
}
