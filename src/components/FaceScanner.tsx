// Scanner facial pe telefon (iOS/Android) cu expo-camera: trei poze (față, stânga, dreapta) cu verificare live a
// luminii și clarității. Mesh-ul 3D cu urmărirea capului există doar pe web (FaceScanner.web.tsx): pe nativ ar trebui
// un development build cu un detector facial nativ (ARKit / vision-camera), care nu rulează în Expo Go.

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { speak, stopSpeaking } from "@/lib/voice";
import { ISSUE_MESSAGE, analyzeFrame, type QualityReport } from "@/lib/imageQuality";
import { Button } from "@/components/Button";
import { FaceGuide, type GuideStatus } from "@/components/FaceGuide";
import { Assistant } from "@/components/Assistant";
import { VoiceToggle } from "@/components/VoiceToggle";
import type { FaceScannerProps, ScanShots } from "@/components/faceScannerTypes";
import { color, font, space } from "@/theme";

type PoseId = "front" | "left" | "right";

const POSES: { id: PoseId; label: string; title: string; instruction: string }[] = [
  {
    id: "front",
    label: "Din față",
    title: "Privește drept în cameră",
    instruction: "Privește drept în cameră, cu fața relaxată și părul dat la o parte.",
  },
  {
    id: "left",
    label: "Stânga",
    title: "Întoarce capul spre stânga ta",
    instruction: "Întoarce încet capul spre stânga ta, cam 45 de grade, și ține bărbia dreaptă.",
  },
  {
    id: "right",
    label: "Dreapta",
    title: "Întoarce capul spre dreapta ta",
    instruction: "Acum întoarce încet capul spre dreapta ta, cam 45 de grade, și ține bărbia dreaptă.",
  },
];

const SAMPLE_EVERY_MS = 1200;
const NEEDED_GOOD_SAMPLES = 2;
const COUNT_WORDS = ["", "unu", "doi", "trei"];

function buzz(kind: "light" | "success" | "warn" = "light") {
  if (kind === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else
    Haptics.notificationAsync(
      kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
}

export function FaceScanner({ onComplete, onCancel }: FaceScannerProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();

  const [poseIndex, setPoseIndex] = useState(0);
  const [shots, setShots] = useState<Partial<Record<PoseId, string>>>({});
  const [report, setReport] = useState<QualityReport | null>(null);
  const [goodStreak, setGoodStreak] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const cameraReady = useRef(false);
  const sampling = useRef(false);
  const cancelled = useRef(false);
  const lastSpokenIssue = useRef<string | null>(null);
  const lastSpokenAt = useRef(0);
  const frontReport = useRef<QualityReport | null>(null);

  const pose = POSES[poseIndex];
  const ovalWidth = Math.min(screenW * 0.7, 300);
  const busy = capturing || countdown !== null;
  const guideStatus: GuideStatus = !report ? "checking" : report.ok ? "ok" : "bad";
  const ready = guideStatus === "ok" && goodStreak >= NEEDED_GOOD_SAMPLES;

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  // ───── voce: instrucțiunea fiecărei poze ─────
  useEffect(() => {
    setReport(null);
    setGoodStreak(0);
    lastSpokenIssue.current = null;
    speak(
      poseIndex === 0
        ? `Hai să începem. ${pose.instruction} Eu verific lumina și îți spun când poți continua.`
        : pose.instruction,
      { caption: pose.title },
    );
  }, [poseIndex, pose.instruction, pose.title]);

  useEffect(
    () => () => {
      cancelled.current = true;
      stopSpeaking();
    },
    [],
  );

  // ───── verificare periodică a calității cadrului ─────
  const sample = useCallback(async () => {
    if (!cameraRef.current || !cameraReady.current || sampling.current) return;
    sampling.current = true;
    try {
      const frame = await cameraRef.current.takePictureAsync({ quality: 0.2, skipProcessing: true, shutterSound: false });
      if (cancelled.current || !frame?.uri) return;
      const result = await analyzeFrame(frame.uri);
      if (cancelled.current) return;
      setReport(result);
      setGoodStreak((s) => (result.ok ? s + 1 : 0));

      const main = result.issues.find((i) => i !== "blurry") ?? null;
      const now = Date.now();
      if (main && (lastSpokenIssue.current !== main || now - lastSpokenAt.current > 12000)) {
        lastSpokenIssue.current = main;
        lastSpokenAt.current = now;
        speak(ISSUE_MESSAGE[main].spoken, { caption: ISSUE_MESSAGE[main].short });
      } else if (!main && lastSpokenIssue.current !== "ok") {
        lastSpokenIssue.current = "ok";
        lastSpokenAt.current = now;
        speak("Perfect, lumina e bună. Apasă „Sunt gata” când ești pregătit.");
      }
    } catch {
      /* un cadru ratat nu oprește scanarea */
    } finally {
      sampling.current = false;
    }
  }, []);

  useEffect(() => {
    if (busy) return;
    const id = setInterval(sample, SAMPLE_EVERY_MS);
    return () => clearInterval(id);
  }, [busy, sample]);

  // ───── numărătoare + captură ─────
  async function startCountdown() {
    if (!ready || busy) return;
    buzz();
    for (let n = 3; n >= 1; n--) {
      if (cancelled.current) return;
      setCountdown(n);
      speak(COUNT_WORDS[n], { caption: false });
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9, shutterSound: true });
      if (!photo?.uri) throw new Error("Camera nu a returnat poza");

      const check = await analyzeFrame(photo.uri);
      if (!check.ok) {
        buzz("warn");
        const main = check.issues.find((i) => i !== "blurry") ?? "blurry";
        speak(`Poza nu a ieșit bine. ${ISSUE_MESSAGE[main].spoken} Mai încercăm o dată.`);
        setGoodStreak(0);
        return;
      }

      buzz("success");
      if (pose.id === "front") frontReport.current = check;
      const next = { ...shots, [pose.id]: photo.uri };
      setShots(next);
      if (poseIndex < POSES.length - 1) {
        setPoseIndex(poseIndex + 1);
      } else {
        const out: ScanShots = { front: next.front!, left: next.left, right: next.right };
        onComplete(out, { mode: "native", poses: Object.values(out).filter(Boolean).length, forced: false });
      }
    } catch (err) {
      Alert.alert("Nu am putut face poza", err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  }

  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View style={[styles.cameraRoot, styles.center, { padding: space.md, gap: space.sm }]}>
        <Text style={styles.poseTitle}>Nu pot porni camera</Text>
        <Text style={styles.deniedText}>Accesul la cameră e dezactivat. Activează-l din setările telefonului.</Text>
        <Button label="Înapoi" onPress={onCancel} />
      </View>
    );
  }

  const mainIssue = report?.issues.find((i) => i !== "blurry") ?? null;
  const statusText = !report
    ? "Verific lumina..."
    : mainIssue
      ? ISSUE_MESSAGE[mainIssue].short
      : report.issues.includes("blurry")
        ? "Ține telefonul nemișcat"
        : ready
          ? "Totul e în regulă"
          : "Se stabilizează...";

  return (
    <View style={styles.cameraRoot}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        animateShutter={false}
        onCameraReady={() => {
          cameraReady.current = true;
        }}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + space.xs }]}>
        <Pressable
          onPress={() => {
            stopSpeaking();
            onCancel();
          }}
          hitSlop={12}
        >
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <View style={styles.poseDots}>
          {POSES.map((p, i) => (
            <View
              key={p.id}
              style={[styles.poseDot, i === poseIndex && styles.poseDotActive, !!shots[p.id] && styles.poseDotDone]}
            />
          ))}
        </View>
        <VoiceToggle dark />
      </View>

      <View style={styles.guideWrap} pointerEvents="none">
        <FaceGuide width={ovalWidth} status={guideStatus} countdown={countdown} beam={!busy} />
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.head}>
          <Assistant size={44} bubble={false} />
          <Animated.View key={pose.id} entering={FadeIn.duration(300)} style={{ flex: 1, gap: 2 }}>
            <Text style={styles.poseLabel}>
              POZA {poseIndex + 1} DIN {POSES.length} · {pose.label.toUpperCase()}
            </Text>
            <Text style={styles.poseTitle}>{pose.title}</Text>
          </Animated.View>
        </View>

        <View style={[styles.statusChip, guideStatus === "ok" ? styles.chipOk : styles.chipBad]}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        <Button
          label={countdown ? `${countdown}...` : capturing ? "Se salvează..." : "Sunt gata"}
          onPress={startCountdown}
          disabled={!ready || busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraRoot: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(28,20,16,0.55)",
  },
  close: { color: color.paper, fontSize: 20, fontFamily: font.bodySemibold },
  poseDots: { flexDirection: "row", gap: 6 },
  poseDot: { width: 28, height: 4, borderRadius: 2, backgroundColor: "rgba(250,246,240,0.3)" },
  poseDotActive: { backgroundColor: color.paper },
  poseDotDone: { backgroundColor: "#8FBF86" },
  guideWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 110 },
  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    gap: space.sm,
    backgroundColor: "rgba(28,20,16,0.82)",
  },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  poseLabel: { fontFamily: font.bodySemibold, fontSize: 12, letterSpacing: 0.8, color: color.glow },
  poseTitle: { fontFamily: font.display, fontSize: 22, lineHeight: 28, color: color.paper },
  deniedText: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: "rgba(250,246,240,0.8)", textAlign: "center" },
  statusChip: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: 999 },
  chipOk: { backgroundColor: "rgba(143,191,134,0.25)" },
  chipBad: { backgroundColor: "rgba(200,137,59,0.28)" },
  statusText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.paper },
});
