import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Image,
  ImageSourcePropType,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const CLOSE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function containedDisplaySize(
  intrinsicW: number,
  intrinsicH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (intrinsicW <= 0 || intrinsicH <= 0) {
    return { w: maxW, h: maxH };
  }
  const ratio = intrinsicW / intrinsicH;
  const boxRatio = maxW / maxH;
  if (ratio >= boxRatio) {
    return { w: maxW, h: Math.round(maxW / ratio) };
  }
  return { w: Math.round(maxH * ratio), h: maxH };
}

/**
 * Clamps outer pan (tx, ty) for transform: T(-p)*S*T(p)*T(t) on rect [0,vw]×[0,vh].
 * Viewport = image container (vw, vh), not full screen — fixes vertical/horizontal bounds.
 */
function clampOuterPanForPivotZoom(
  tx: number,
  ty: number,
  s: number,
  px: number,
  py: number,
  vw: number,
  vh: number,
): { tx: number; ty: number } {
  "worklet";
  if (s <= 1) {
    return { tx: 0, ty: 0 };
  }
  const cornersX = [0, vw, 0, vw];
  const cornersY = [0, 0, vh, vh];
  let minX0 = Number.POSITIVE_INFINITY;
  let maxX0 = Number.NEGATIVE_INFINITY;
  let minY0 = Number.POSITIVE_INFINITY;
  let maxY0 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < 4; i += 1) {
    const cx = cornersX[i];
    const cy = cornersY[i];
    const x0 = s * (cx - px) + px;
    const y0 = s * (cy - py) + py;
    if (x0 < minX0) {
      minX0 = x0;
    }
    if (x0 > maxX0) {
      maxX0 = x0;
    }
    if (y0 < minY0) {
      minY0 = y0;
    }
    if (y0 > maxY0) {
      maxY0 = y0;
    }
  }
  const txLow = vw - maxX0;
  const txHigh = -minX0;
  let ctx = tx;
  if (txLow <= txHigh) {
    ctx = Math.min(Math.max(tx, txLow), txHigh);
  } else {
    ctx = vw * 0.5 - (minX0 + maxX0) * 0.5;
  }
  const tyLow = vh - maxY0;
  const tyHigh = -minY0;
  let cty = ty;
  if (tyLow <= tyHigh) {
    cty = Math.min(Math.max(ty, tyLow), tyHigh);
  } else {
    cty = vh * 0.5 - (minY0 + maxY0) * 0.5;
  }
  return { tx: ctx, ty: cty };
}

type ZoomableProps = {
  imageSource: ImageSourcePropType;
  baseW: number;
  baseH: number;
  onIntrinsicLoad: (iw: number, ih: number) => void;
};

function ZoomableImagePreview(props: ZoomableProps): ReactElement {
  const { imageSource, baseW, baseH, onIntrinsicLoad } = props;

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const pinchBaseScale = useSharedValue(1);
  /** Pinch pivot in view coords; explicit T(-p)*S*T(p)*T(pan) avoids RN implicit scale origin. */
  const pivotX = useSharedValue(0);
  const pivotY = useSharedValue(0);
  const baseWSv = useSharedValue(baseW);
  const baseHSv = useSharedValue(baseH);

  useEffect(() => {
    baseWSv.value = baseW;
    baseHSv.value = baseH;
  }, [baseW, baseH, baseHSv, baseWSv]);

  useEffect(() => {
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    scale.value = MIN_SCALE;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    pinchBaseScale.value = MIN_SCALE;
    pivotX.value = 0;
    pivotY.value = 0;
  }, [baseW, baseH]);

  const gesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pinch()
          .onStart((e) => {
            "worklet";
            const s = scale.value;
            pinchBaseScale.value = s;
            const bw = baseWSv.value;
            const bh = baseHSv.value;
            const cx = bw * 0.5;
            const cy = bh * 0.5;
            const rawFx = e.focalX;
            const rawFy = e.focalY;
            const focalMissing =
              !Number.isFinite(rawFx) ||
              !Number.isFinite(rawFy) ||
              (rawFx === 0 && rawFy === 0);
            const fNewX = focalMissing ? cx : rawFx;
            const fNewY = focalMissing ? cy : rawFy;
            const fOldX = pivotX.value;
            const fOldY = pivotY.value;
            translateX.value += (1 - s) * fOldX + (s - 1) * fNewX;
            translateY.value += (1 - s) * fOldY + (s - 1) * fNewY;
            pivotX.value = fNewX;
            pivotY.value = fNewY;
          })
          .onUpdate((e) => {
            "worklet";
            const s0 = pinchBaseScale.value;
            let s1 = s0 * e.scale;
            if (s1 < MIN_SCALE) {
              s1 = MIN_SCALE;
            }
            if (s1 > MAX_SCALE) {
              s1 = MAX_SCALE;
            }
            if (s1 <= MIN_SCALE) {
              scale.value = MIN_SCALE;
              translateX.value = 0;
              translateY.value = 0;
              pivotX.value = 0;
              pivotY.value = 0;
              return;
            }
            scale.value = s1;
          })
          .onEnd(() => {
            "worklet";
            if (scale.value < MIN_SCALE) {
              scale.value = MIN_SCALE;
            }
            if (scale.value > MAX_SCALE) {
              scale.value = MAX_SCALE;
            }
            if (scale.value <= MIN_SCALE) {
              scale.value = MIN_SCALE;
              translateX.value = withSpring(0);
              translateY.value = withSpring(0);
              pivotX.value = 0;
              pivotY.value = 0;
              savedTranslateX.value = 0;
              savedTranslateY.value = 0;
            } else {
              pinchBaseScale.value = scale.value;
              const c = clampOuterPanForPivotZoom(
                translateX.value,
                translateY.value,
                scale.value,
                pivotX.value,
                pivotY.value,
                baseWSv.value,
                baseHSv.value,
              );
              translateX.value = c.tx;
              translateY.value = c.ty;
              savedTranslateX.value = c.tx;
              savedTranslateY.value = c.ty;
            }
          }),
        Gesture.Pan()
          .maxPointers(1)
          .onStart(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
          })
          .onUpdate((e) => {
            "worklet";
            if (scale.value <= MIN_SCALE) {
              return;
            }
            const nextX = savedTranslateX.value + e.translationX;
            const nextY = savedTranslateY.value + e.translationY;
            const c = clampOuterPanForPivotZoom(
              nextX,
              nextY,
              scale.value,
              pivotX.value,
              pivotY.value,
              baseWSv.value,
              baseHSv.value,
            );
            translateX.value = c.tx;
            translateY.value = c.ty;
          })
          .onEnd(() => {
            "worklet";
            if (scale.value <= MIN_SCALE) {
              translateX.value = withSpring(0);
              translateY.value = withSpring(0);
              pivotX.value = 0;
              pivotY.value = 0;
              savedTranslateX.value = 0;
              savedTranslateY.value = 0;
              return;
            }
            const c = clampOuterPanForPivotZoom(
              translateX.value,
              translateY.value,
              scale.value,
              pivotX.value,
              pivotY.value,
              baseWSv.value,
              baseHSv.value,
            );
            translateX.value = c.tx;
            translateY.value = c.ty;
            savedTranslateX.value = c.tx;
            savedTranslateY.value = c.ty;
          }),
      ),
    [],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -pivotX.value },
      { translateY: -pivotY.value },
      { scale: scale.value },
      { translateX: pivotX.value },
      { translateY: pivotY.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width: baseW, height: baseH }, animatedStyle]}>
        <Image
          source={imageSource}
          style={StyleSheet.absoluteFillObject}
          resizeMode="contain"
          onLoad={(e) => {
            const { width: iw, height: ih } = e.nativeEvent.source;
            if (typeof iw === "number" && typeof ih === "number" && iw > 0 && ih > 0) {
              onIntrinsicLoad(iw, ih);
            }
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}

export function ChatImagePreviewModal(props: {
  visible: boolean;
  onRequestClose: () => void;
  imageSource: ImageSourcePropType;
  winW: number;
  winH: number;
}): ReactElement {
  const { visible, onRequestClose, imageSource, winW, winH } = props;
  const topInset = (Constants.statusBarHeight ?? 0) + 8;
  const maxW = winW;
  const maxH = Math.round(winH * 0.92);

  const [displaySize, setDisplaySize] = useState({ w: maxW, h: maxH });

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDisplaySize({ w: maxW, h: maxH });
  }, [visible, maxW, maxH, imageSource]);

  const onIntrinsicLoad = useMemo(
    () => (iw: number, ih: number) => {
      setDisplaySize(containedDisplaySize(iw, ih, maxW, maxH));
    },
    [maxH, maxW],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.previewRoot}>
          <Pressable
            style={styles.previewBackdrop}
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          />
          <View style={styles.previewImageWrap} pointerEvents="box-none">
            <View style={{ width: displaySize.w, height: displaySize.h }}>
              {visible ? (
                <ZoomableImagePreview
                  imageSource={imageSource}
                  baseW={displaySize.w}
                  baseH={displaySize.h}
                  onIntrinsicLoad={onIntrinsicLoad}
                />
              ) : null}
            </View>
          </View>
          <Pressable
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Close image"
            hitSlop={CLOSE_HIT_SLOP}
            style={[styles.previewCloseBtn, { top: topInset }]}
          >
            <View style={styles.previewCloseInner}>
              <Ionicons name="close" size={26} color="#ffffff" />
            </View>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  previewRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  previewImageWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  previewCloseBtn: {
    position: "absolute",
    right: 12,
    zIndex: 20,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  previewCloseInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
