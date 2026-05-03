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

function clampPanValues(
  tx: number,
  ty: number,
  s: number,
  bw: number,
  bh: number,
  sw: number,
  sh: number,
): { tx: number; ty: number } {
  "worklet";
  if (s <= 1) {
    return { tx: 0, ty: 0 };
  }
  const margin = 40;
  const scaledW = bw * s;
  const scaledH = bh * s;
  const maxX = Math.max(0, (scaledW - sw) / 2 + margin);
  const maxY = Math.max(0, (scaledH - sh) / 2 + margin);
  return {
    tx: Math.min(Math.max(tx, -maxX), maxX),
    ty: Math.min(Math.max(ty, -maxY), maxY),
  };
}

type ZoomableProps = {
  imageSource: ImageSourcePropType;
  baseW: number;
  baseH: number;
  screenW: number;
  screenH: number;
  onIntrinsicLoad: (iw: number, ih: number) => void;
};

function ZoomableImagePreview(props: ZoomableProps): ReactElement {
  const { imageSource, baseW, baseH, screenW, screenH, onIntrinsicLoad } = props;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const baseWSv = useSharedValue(baseW);
  const baseHSv = useSharedValue(baseH);
  const screenWSv = useSharedValue(screenW);
  const screenHSv = useSharedValue(screenH);

  useEffect(() => {
    baseWSv.value = baseW;
    baseHSv.value = baseH;
  }, [baseW, baseH, baseHSv, baseWSv]);

  useEffect(() => {
    screenWSv.value = screenW;
    screenHSv.value = screenH;
  }, [screenH, screenW, screenHSv, screenWSv]);

  useEffect(() => {
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    scale.value = MIN_SCALE;
    savedScale.value = MIN_SCALE;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [baseW, baseH]);

  const gesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pinch()
          .onStart(() => {
            savedScale.value = scale.value;
          })
          .onUpdate((e) => {
            const next = savedScale.value * e.scale;
            scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
          })
          .onEnd(() => {
            if (scale.value < MIN_SCALE) {
              scale.value = MIN_SCALE;
            }
            if (scale.value > MAX_SCALE) {
              scale.value = MAX_SCALE;
            }
            savedScale.value = scale.value;
            if (scale.value <= MIN_SCALE) {
              scale.value = MIN_SCALE;
              savedScale.value = MIN_SCALE;
              translateX.value = withSpring(0);
              translateY.value = withSpring(0);
              savedTranslateX.value = 0;
              savedTranslateY.value = 0;
            } else {
              const c = clampPanValues(
                translateX.value,
                translateY.value,
                scale.value,
                baseWSv.value,
                baseHSv.value,
                screenWSv.value,
                screenHSv.value,
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
            if (scale.value <= MIN_SCALE) {
              return;
            }
            const nextX = savedTranslateX.value + e.translationX;
            const nextY = savedTranslateY.value + e.translationY;
            const c = clampPanValues(
              nextX,
              nextY,
              scale.value,
              baseWSv.value,
              baseHSv.value,
              screenWSv.value,
              screenHSv.value,
            );
            translateX.value = c.tx;
            translateY.value = c.ty;
          })
          .onEnd(() => {
            if (scale.value <= MIN_SCALE) {
              translateX.value = withSpring(0);
              translateY.value = withSpring(0);
              savedTranslateX.value = 0;
              savedTranslateY.value = 0;
              return;
            }
            const c = clampPanValues(
              translateX.value,
              translateY.value,
              scale.value,
              baseWSv.value,
              baseHSv.value,
              screenWSv.value,
              screenHSv.value,
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
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
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
                  screenW={winW}
                  screenH={winH}
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
