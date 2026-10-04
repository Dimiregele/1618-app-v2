import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { runScan } from "@/lib/faceScan";
import { speak, stopSpeaking } from "@/lib/voice";
import { ISSUE_MESSAGE, analyzeFrame, type QualityReport } from "@/lib/imageQuality";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { StepIndicator } from "@/components/StepIndicator";
import { FaceGuide, type GuideStatus } from "@/components/FaceGuide";
import { VoiceToggle } from "@/components/VoiceToggle";
import { color, font, radius, space, type } from "@/theme";

type PoseId = "front" | "left" | "right";
type Phase = "intro" | "capture" | "review" | "analyzing";

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

const CHECKLIST = [
  "Lumină naturală sau lumină albă în fața ta, nu în spatele tău",
  "Fără ochelari, șapcă sau păr peste față",
  "Față relaxată, fără machiaj greu sau filtre",
  "Telefonul la lungimea brațului, ținut vertical",
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

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>("intro");
  const [consent, setConsent] = useState(false);
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
  const lastSpokenIssue = useRef<string | null>(null);
  const lastSpokenAt = useRef(0);
  const cancelled = useRef(false);

  const pose = POSES[poseIndex];
  const ovalWidth = Math.min(screenW * 0.7, 300);
  const busy = capturing || countdown !== null;

  const guideStatus: GuideStatus = !report ? "checking" : report.ok ? "ok" : "bad";
  const ready = guideStatus === "ok" && goodStreak >= NEEDED_GOOD_SAMPLES;

  // ───── voce: instrucțiunea fiecărei poze ─────
  useEffect(() => {
    if (phase !== "capture") return;
    setReport(null);
    setGoodStreak(0);
    lastSpokenIssue.current = null;
    speak(
      poseIndex === 0
        ? `Hai să începem. ${pose.instruction} Eu verific lumina și îți spun când poți continua.`
        : pose.instruction,
    );
  }, [phase, poseIndex, pose.instruction]);

  useEffect(
    () => () => {
      cancelled.current = true;
      stopSpeaking();
    },
    [],
  );

  // ───── verificare periodică a calității cadrului (lumină, claritate) ─────
  const sample = useCallback(async () => {
    if (!cameraRef.current || !cameraReady.current || sampling.current) return;
    sampling.current = true;
    try {
      const frame = await cameraRef.current.takePictureAsync({
        quality: 0.2,
        skipProcessing: true,
        shutterSound: false,
      });
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
        speak(ISSUE_MESSAGE[main].spoken);
      } else if (!main && lastSpokenIssue.current !== "ok") {
        lastSpokenIssue.current = "ok";
        lastSpokenAt.current = now;
        speak("Perfect, lumina e bună. Apasă „Sunt gata” când ești pregătit.");
      }
    } catch {
      /* un cadru ratat nu oprește scanarea; încercăm din nou la următorul ciclu */
    } finally {
      sampling.current = false;
    }
  }, []);

  useEffect(() => {
    if (phase !== "capture" || busy) return;
    const id = setInterval(sample, SAMPLE_EVERY_MS);
    return () => clearInterval(id);
  }, [phase, busy, sample]);

  // ───── pornire ─────
  async function startCapture() {
    if (!consent) return;
    buzz();
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return; // ecranul de permisiune explică ce urmează
    }
    setShots({});
    setPoseIndex(0);
    setPhase("capture");
  }

  async function pickFromLibrary() {
    if (!consent) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      if (result.canceled) return;
      setShots({ front: result.assets[0].uri });
      setPhase("review");
    } catch (err) {
      Alert.alert("Nu am putut deschide galeria", err instanceof Error ? err.message : String(err));
    }
  }

  // ───── numărătoare + captură ─────
  async function startCountdown() {
    if (!ready || busy) return;
    buzz();
    for (let n = 3; n >= 1; n--) {
      if (cancelled.current) return;
      setCountdown(n);
      speak(COUNT_WORDS[n]);
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
        const main = check.issues.find((i) => i !== "blurry")!;
        speak(`Poza nu a ieșit bine. ${ISSUE_MESSAGE[main].spoken} Mai încercăm o dată.`);
        setGoodStreak(0);
        return;
      }

      buzz("success");
      setShots((s) => ({ ...s, [pose.id]: photo.uri }));
      if (poseIndex < POSES.length - 1) {
        setPoseIndex(poseIndex + 1);
      } else {
        speak("Gata, am toate pozele. Verifică-le și apasă Analizează.");
        setPhase("review");
      }
    } catch (err) {
      Alert.alert("Nu am putut face poza", err instanceof Error ? err.message : String(err));
    } finally {
      setCapturing(false);
    }
  }

  // ───── analiză ─────
  async function analyzeAndContinue() {
    const front = shots.front;
    if (!front) return;
    setPhase("analyzing");
    speak("Îți analizez fața. Durează câteva secunde.");
    try {
      // Doar poza din față merge la analiză acum; profilele sunt păstrate doar pe telefon.
      const { scanId } = await runScan(front);
      stopSpeaking();
      router.push({ pathname: "/(onboarding)/questionnaire", params: { scanId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Eroare necunoscută";
      speak(message);
      Alert.alert("Scanarea a eșuat", message);
      setPhase("review");
    }
  }

  function retake(id: PoseId) {
    const i = POSES.findIndex((p) => p.id === id);
    setPoseIndex(i);
    setShots((s) => {
      const copy = { ...s };
      delete copy[id];
      return copy;
    });
    setPhase("capture");
  }

  // ═════════════════ INTRO ═════════════════
  if (phase === "intro") {
    const denied = permission && !permission.granted && !permission.canAskAgain;
    return (
      <ScreenContainer>
        <StepIndicator step={1} total={4} />
        <VoiceToggle />

        <Animated.View entering={FadeInDown.duration(360)} style={{ gap: space.xs }}>
          <Text style={type.h1}>Scanare facială</Text>
          <Text style={type.bodyMuted}>
            Facem trei poze (din față și din profil), pe care le verificăm pe loc: lumină, claritate și încadrare.
            O singură scanare identifică toate problemele relevante.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(360)} style={styles.checklist}>
          <Text style={type.label}>ÎNAINTE SĂ ÎNCEPEM</Text>
          {CHECKLIST.map((item) => (
            <View key={item} style={styles.checkRow}>
              <Text style={styles.checkDot}>◦</Text>
              <Text style={[type.body, { flex: 1 }]}>{item}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(360)}>
          <Pressable
            onPress={() => {
              buzz();
              setConsent(!consent);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            style={styles.consent}
          >
            <View style={[styles.box, consent && styles.boxOn]}>{consent && <Text style={styles.tick}>✓</Text>}</View>
            <Text style={[type.bodyMuted, { flex: 1 }]}>
              Sunt de acord ca fața mea să fie analizată pentru recomandările din aplicație. Imaginea nu se
              stochează; păstrăm doar rezultatul analizei. Pot șterge datele oricând.
            </Text>
          </Pressable>
        </Animated.View>

        {denied && (
          <View style={styles.notice}>
            <Text style={[type.bodyMuted, { color: color.glowDeep }]}>
              Accesul la cameră e dezactivat. Activează-l din setările telefonului ca să putem scana.
            </Text>
            {Platform.OS !== "web" && (
              <Button label="Deschide setările" variant="secondary" onPress={() => Linking.openSettings()} />
            )}
          </View>
        )}

        <Button label="Începe scanarea" onPress={startCapture} disabled={!consent || !!denied} />
        <Button label="Încarc o poză din galerie" variant="ghost" onPress={pickFromLibrary} disabled={!consent} />
      </ScreenContainer>
    );
  }

  // ═════════════════ CAPTURE ═════════════════
  if (phase === "capture") {
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
              setPhase("intro");
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
          <Animated.View key={pose.id} entering={FadeIn.duration(300)} style={{ gap: 4 }}>
            <Text style={styles.poseLabel}>
              POZA {poseIndex + 1} DIN {POSES.length} · {pose.label.toUpperCase()}
            </Text>
            <Text style={styles.poseTitle}>{pose.title}</Text>
          </Animated.View>

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

  // ═════════════════ REVIEW / ANALYZING ═════════════════
  const analyzing = phase === "analyzing";
  return (
    <ScreenContainer>
      <StepIndicator step={1} total={4} />
      <View style={{ gap: space.xs }}>
        <Text style={type.h1}>{analyzing ? "Analizăm scanarea" : "Verifică pozele"}</Text>
        <Text style={type.bodyMuted}>
          {analyzing
            ? "Analiza pielii, a părului și a zonei ochilor se face într-o singură trecere."
            : "Dacă o poză nu arată bine, o poți reface."}
        </Text>
      </View>

      <View style={styles.hero}>
        {shots.front && <Image source={{ uri: shots.front }} style={styles.heroImage} />}
        {analyzing && <AnalyzeBeam />}
      </View>

      <View style={styles.thumbRow}>
        {POSES.map((p) => (
          <Pressable key={p.id} disabled={analyzing} onPress={() => retake(p.id)} style={styles.thumbWrap}>
            {shots[p.id] ? (
              <Image source={{ uri: shots[p.id] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Text style={type.bodyMuted}>+</Text>
              </View>
            )}
            <Text style={styles.thumbLabel}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {analyzing ? (
        <AnalyzeStatus />
      ) : (
        <>
          <Button label="Analizează" onPress={analyzeAndContinue} disabled={!shots.front} />
          <Button label="Reia scanarea" variant="ghost" onPress={() => retake("front")} />
        </>
      )}
    </ScreenContainer>
  );
}

// Linie luminoasă care se plimbă peste poză cât rulează analiza.
function AnalyzeBeam() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);
  const style = useAnimatedStyle(() => ({ top: `${t.value * 96}%` }));
  return (
    <Animated.View pointerEvents="none" style={[styles.analyzeBeam, style]} exiting={FadeOut} />
  );
}

const ANALYZE_STEPS = [
  "Trimitem scanarea în siguranță",
  "Analizăm textura și tonul pielii",
  "Verificăm scalpul și linia părului",
  "Evaluăm zona ochilor",
  "Pregătim recomandările",
];

function AnalyzeStatus() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => Math.min(n + 1, ANALYZE_STEPS.length - 1)), 2200);
    return () => clearInterval(id);
  }, []);
  const label = useMemo(() => ANALYZE_STEPS[i], [i]);
  return (
    <Animated.View key={label} entering={FadeIn.duration(300)} style={styles.analyzeStatus}>
      <Text style={styles.analyzeText}>{label}...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  checklist: { gap: space.xs, padding: space.md, backgroundColor: "#F3ECE0", borderRadius: radius.sm },
  checkRow: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  checkDot: { fontFamily: font.bodySemibold, fontSize: 16, color: color.glowDeep, lineHeight: 23 },
  consent: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  box: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderColor: color.bark,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxOn: { backgroundColor: color.glow, borderColor: color.glow },
  tick: { color: color.ink, fontFamily: font.bodySemibold, fontSize: 14, lineHeight: 16 },
  notice: { gap: space.xs, padding: space.sm, backgroundColor: "#F3E6D2", borderRadius: radius.sm },

  cameraRoot: { flex: 1, backgroundColor: "#000" },
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
  guideWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 90 },
  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    gap: space.sm,
    backgroundColor: "rgba(28,20,16,0.82)",
  },
  poseLabel: { fontFamily: font.bodySemibold, fontSize: 12, letterSpacing: 0.8, color: color.glow },
  poseTitle: { fontFamily: font.display, fontSize: 22, lineHeight: 28, color: color.paper },
  statusChip: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: 999 },
  chipOk: { backgroundColor: "rgba(143,191,134,0.25)" },
  chipBad: { backgroundColor: "rgba(200,137,59,0.28)" },
  statusText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.paper },

  hero: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.hero,
    overflow: "hidden",
    backgroundColor: "#EFE8DC",
  },
  heroImage: { width: "100%", height: "100%" },
  analyzeBeam: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: color.glow,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  thumbRow: { flexDirection: "row", gap: space.sm },
  thumbWrap: { flex: 1, gap: 4, alignItems: "center" },
  thumb: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.sm, backgroundColor: "#EFE8DC" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbLabel: { fontFamily: font.bodySemibold, fontSize: 12, color: color.bark },
  analyzeStatus: { paddingVertical: space.sm, alignItems: "center" },
  analyzeText: { fontFamily: font.displayItalic, fontSize: 18, color: color.glowDeep },
});
