import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { replay, useAssistantState } from "@/lib/voice";
import { color, font, radius, space } from "@/theme";

// Avatarul asistentului („Phi”): disc cald cu ochi care clipesc și o gură care se mișcă cât vorbește.
// Lângă el apare un balon cu textul rostit (și când vocea e oprită, ca să poți citi). Atinge avatarul ca să repete.
export function Assistant({
  size = 56,
  bubble = true,
  idleHint,
}: {
  size?: number;
  /** Arată balonul cu textul rostit. */
  bubble?: boolean;
  /** Text mic afișat când nu rostește nimic (ex. „Atinge-mă ca să repet”). */
  idleHint?: string;
}) {
  const { speaking, loading, caption } = useAssistantState();

  const mouth = useSharedValue(0);
  const blink = useSharedValue(1);
  const breathe = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    if (speaking) {
      mouth.value = withRepeat(
        withSequence(
          withTiming(0.9, { duration: 120 }),
          withTiming(0.25, { duration: 100 }),
          withTiming(1, { duration: 140 }),
          withTiming(0.4, { duration: 110 }),
          withTiming(0.75, { duration: 130 }),
          withTiming(0.15, { duration: 100 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(mouth);
      mouth.value = withTiming(0, { duration: 180 });
    }
  }, [speaking, mouth]);

  useEffect(() => {
    blink.value = withRepeat(
      withSequence(withDelay(3200, withTiming(0.08, { duration: 90 })), withTiming(1, { duration: 120 })),
      -1,
      false,
    );
    breathe.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [blink, breathe]);

  useEffect(() => {
    if (speaking || loading) {
      halo.value = withRepeat(withTiming(1, { duration: speaking ? 900 : 1300, easing: Easing.out(Easing.quad) }), -1, false);
    } else {
      cancelAnimation(halo);
      halo.value = withTiming(0, { duration: 200 });
    }
  }, [speaking, loading, halo]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.025 }] }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const mouthStyle = useAnimatedStyle(() => ({
    height: size * 0.05 + mouth.value * size * 0.17,
    width: size * (0.3 - mouth.value * 0.07),
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - halo.value) * 0.55,
    transform: [{ scale: 1 + halo.value * 0.45 }],
  }));

  const eyeW = size * 0.1;
  const eyeH = size * 0.14;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={replay}
        accessibilityRole="button"
        accessibilityLabel="Asistent. Atinge ca să repete ultima replică"
        style={{ width: size, height: size }}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { width: size, height: size, borderRadius: size / 2 }, haloStyle]}
        />
        <Animated.View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }, discStyle]}>
          <View style={[styles.shine, { width: size * 0.42, height: size * 0.42, borderRadius: size }]} />
          <View style={[styles.eyes, { top: size * 0.33, gap: size * 0.2 }]}>
            <Animated.View style={[styles.eye, { width: eyeW, height: eyeH, borderRadius: eyeW }, eyeStyle]} />
            <Animated.View style={[styles.eye, { width: eyeW, height: eyeH, borderRadius: eyeW }, eyeStyle]} />
          </View>
          <Animated.View style={[styles.mouth, { top: size * 0.62 }, mouthStyle]} />
        </Animated.View>
      </Pressable>

      {bubble && (caption || idleHint) ? (
        <Animated.View
          key={caption ?? "hint"}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(120)}
          style={styles.bubbleWrap}
        >
          <View style={styles.tail} />
          <View style={styles.bubble}>
            <Text style={caption ? styles.bubbleText : styles.hintText}>{caption ?? idleHint}</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  halo: { position: "absolute", left: 0, top: 0, borderWidth: 2, borderColor: color.glow },
  disc: {
    backgroundColor: color.ink,
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: color.glow,
  },
  shine: { position: "absolute", left: "10%", top: "6%", backgroundColor: color.glow, opacity: 0.16 },
  eyes: { position: "absolute", flexDirection: "row" },
  eye: { backgroundColor: color.paper },
  mouth: { position: "absolute", backgroundColor: color.glow, borderRadius: 999 },
  bubbleWrap: { flex: 1, flexDirection: "row", alignItems: "center" },
  tail: {
    width: 10,
    height: 10,
    backgroundColor: "#FFFDF9",
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.line,
    transform: [{ rotate: "45deg" }],
    marginRight: -6,
    zIndex: 1,
  },
  bubble: {
    flex: 1,
    backgroundColor: "#FFFDF9",
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.hero / 2,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.sm + 2,
  },
  bubbleText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.ink },
  hintText: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.bark },
});
