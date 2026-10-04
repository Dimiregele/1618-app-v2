import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { color, font } from "@/theme";

export type GuideStatus = "checking" | "bad" | "ok";

const AMBER = color.glow;
const GREEN = "#8FBF86";

// Ovalul de încadrare pentru fața din cameră: inel care se face verde când condițiile sunt bune,
// o linie de scanare care se plimbă pe verticală și, opțional, un numărător.
export function FaceGuide({
  width,
  status,
  countdown,
  beam = true,
}: {
  width: number;
  status: GuideStatus;
  countdown?: number | null;
  beam?: boolean;
}) {
  const height = Math.round(width * 1.32);
  const ok = useSharedValue(0);
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    ok.value = withTiming(status === "ok" ? 1 : 0, { duration: 350 });
  }, [status, ok]);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true);
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [sweep, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ok.value, [0, 1], [AMBER, GREEN]),
    transform: [{ scale: 1 + pulse.value * 0.012 }],
    opacity: 0.85 + pulse.value * 0.15,
  }));

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * (height - 3) }],
    backgroundColor: interpolateColor(ok.value, [0, 1], [AMBER, GREEN]),
    opacity: beam ? 0.9 : 0,
  }));

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Animated.View style={[styles.ring, ringStyle]} />
      <View style={styles.clip}>
        <Animated.View style={[styles.beam, beamStyle]} />
      </View>
      {countdown ? (
        <View style={styles.countWrap}>
          <Text style={styles.count}>{countdown}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { ...StyleSheet.absoluteFill, borderWidth: 3, borderRadius: "50%" },
  clip: { ...StyleSheet.absoluteFill, borderRadius: "50%", overflow: "hidden" },
  beam: {
    height: 3,
    width: "100%",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  countWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  count: { fontFamily: font.display, fontSize: 96, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 12 },
});
