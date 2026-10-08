import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
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

// „Phi”, asistentul: un corp lucios bej, în formă de bob, cu doi ochi mari, negri și lucioși. Fără gură:
// când vorbește, se mișcă ușor ca o jucărie moale (se întinde și se strânge), iar în jur apare un halou.
// Lângă el apare un balon cu textul rostit (și când vocea e oprită, ca să poți citi). Atinge-l ca să repete.

const VB_W = 100;
const VB_H = 128;
const BODY_PATH =
  "M50 6 C74 6 88 26 88 52 C88 72 98 84 94 102 C90 116 72 120 50 120 C28 120 10 116 6 102 C2 84 12 72 12 52 C12 26 26 6 50 6 Z";

function PhiBody({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Defs>
        <RadialGradient id="phiBody" cx="38%" cy="26%" rx="75%" ry="80%" fx="38%" fy="26%">
          <Stop offset="0" stopColor="#EBD3AC" />
          <Stop offset="0.55" stopColor="#CDAE84" />
          <Stop offset="1" stopColor="#AE8E63" />
        </RadialGradient>
        <LinearGradient id="phiShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.55" stopColor="#5B4125" stopOpacity="0" />
          <Stop offset="1" stopColor="#5B4125" stopOpacity="0.28" />
        </LinearGradient>
      </Defs>
      {/* umbra de sub el, ca și cum ar pluti */}
      <Ellipse cx="50" cy="124" rx="30" ry="3" fill="#1C1410" opacity="0.14" />
      <Path d={BODY_PATH} fill="url(#phiBody)" />
      <Path d={BODY_PATH} fill="url(#phiShade)" />
      {/* reflexiile: dungă lungă pe dreapta, lumină pe marginea stângă, strălucire sus */}
      <Path
        d="M70 20 C80 28 86 40 86 58 C80 46 72 35 62 27 C65 23 67 21 70 20 Z"
        fill="#FFFFFF"
        opacity="0.42"
      />
      <Path d="M17 58 C16 70 9 80 9 94 C6 82 12 70 13 56 C14 52 17 52 17 58 Z" fill="#FFFFFF" opacity="0.3" />
      <Ellipse cx="38" cy="16" rx="12" ry="5" fill="#FFFFFF" opacity="0.3" transform="rotate(-18 38 16)" />
      <Path d={BODY_PATH} fill="none" stroke="#8A6A43" strokeOpacity="0.35" strokeWidth="0.8" />
    </Svg>
  );
}

function PhiEye({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id="phiEye" cx="40%" cy="35%" rx="65%" ry="65%" fx="40%" fy="35%">
          <Stop offset="0" stopColor="#30363C" />
          <Stop offset="0.6" stopColor="#0B0D0F" />
          <Stop offset="1" stopColor="#020303" />
        </RadialGradient>
      </Defs>
      <Circle cx="12" cy="12" r="12" fill="url(#phiEye)" />
      <Circle cx="8.3" cy="7.8" r="3.3" fill="#FFFFFF" opacity="0.95" />
      <Circle cx="16.4" cy="16.6" r="1.4" fill="#FFFFFF" opacity="0.65" />
      <Path d="M4 15 C5 18.5 8 21 12 21.5" stroke="#9FB4C4" strokeOpacity="0.35" strokeWidth="0.8" fill="none" />
    </Svg>
  );
}

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

  const talk = useSharedValue(0);
  const blink = useSharedValue(1);
  const float = useSharedValue(0);
  const look = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    if (speaking) {
      talk.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
          withTiming(0.2, { duration: 150 }),
          withTiming(0.85, { duration: 120 }),
          withTiming(0.1, { duration: 170 }),
          withTiming(0.6, { duration: 110 }),
          withTiming(0, { duration: 140 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(talk);
      talk.value = withTiming(0, { duration: 200 });
    }
  }, [speaking, talk]);

  useEffect(() => {
    blink.value = withRepeat(
      withSequence(withDelay(3200, withTiming(0.06, { duration: 90 })), withTiming(1, { duration: 130 })),
      -1,
      false,
    );
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    look.value = withRepeat(
      withSequence(
        withDelay(2600, withTiming(1, { duration: 280 })),
        withDelay(900, withTiming(-1, { duration: 360 })),
        withDelay(700, withTiming(0, { duration: 280 })),
      ),
      -1,
      false,
    );
  }, [blink, float, look]);

  useEffect(() => {
    if (speaking || loading) {
      halo.value = withRepeat(withTiming(1, { duration: speaking ? 900 : 1300, easing: Easing.out(Easing.quad) }), -1, false);
    } else {
      cancelAnimation(halo);
      halo.value = withTiming(0, { duration: 200 });
    }
  }, [speaking, loading, halo]);

  const bodyW = size * (VB_W / VB_H);
  const eyeSize = size * 0.17;
  const eyeY = size * (6 + 0.31 * 114) / VB_H - eyeSize / 2; // ochii stau pe ~31% din înălțimea corpului
  const eyeGap = bodyW * 0.11;

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -float.value * size * 0.025 },
      { scaleY: 1 + talk.value * 0.045 },
      { scaleX: 1 - talk.value * 0.025 },
    ],
  }));
  const eyeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: look.value * size * 0.018 }, { scaleY: blink.value }, { scale: 1 + talk.value * 0.05 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: Math.min(halo.value * 10, 1) * (1 - halo.value) * 0.5,
    transform: [{ scale: 1 + halo.value * 0.4 }],
  }));

  return (
    <View style={styles.row}>
      <Pressable
        onPress={replay}
        accessibilityRole="button"
        accessibilityLabel="Asistent. Atinge ca să repete ultima replică"
        style={{ width: bodyW, height: size }}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { width: bodyW, height: size * 0.94, borderRadius: bodyW * 0.5 }, haloStyle]}
        />
        <Animated.View style={[{ width: bodyW, height: size }, bodyStyle]}>
          <PhiBody width={bodyW} height={size} />
          <Animated.View
            pointerEvents="none"
            style={[styles.eyes, { top: eyeY, gap: eyeGap, width: bodyW }, eyeStyle]}
          >
            <PhiEye size={eyeSize} />
            <PhiEye size={eyeSize} />
          </Animated.View>
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
  eyes: { position: "absolute", left: 0, flexDirection: "row", justifyContent: "center" },
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
