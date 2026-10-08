// Scanner facial pentru web: mesh 3D cu 478 de puncte (MediaPipe Face Landmarker) rulat local în browser.
//
// Cum funcționează:
//  - modelul urmărește fața în timp real și dă puncte 3D + poziția capului (yaw/pitch/roll) + expresia;
//  - ghidăm utilizatorul ca la Face ID: față → o parte → cealaltă parte → (opțional) capul în jos pentru scalp;
//  - fiecare poziție se capturează AUTOMAT când lumina, încadrarea, expresia și poziția sunt bune și imaginea e stabilă;
//  - fiecare poză e decupată portret în jurul feței, ca să ocupe cât mai mult din imaginea analizată.
//
// Limite oneste: adâncimea e ESTIMATĂ dintr-o cameră obișnuită (nu senzor TrueDepth), iar pragurile nu sunt calibrate
// pe sute de dispozitive. Dacă modelul nu se poate încărca, trecem pe un mod simplu (o poză, declanșare manuală).

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type * as Vision from "@mediapipe/tasks-vision";
import type { FaceLandmarker as FaceLandmarkerType, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { speak, stopSpeaking } from "@/lib/voice";
import {
  LM,
  analyzeLighting,
  checkFraming,
  estimatePose,
  expressionIssues,
  faceBox,
  isBlurry,
  makeViewMap,
  pitchFromLandmarks,
  portraitCrop,
  type LightingReport,
  type Pt,
} from "@/lib/faceGeometry";
import { Assistant } from "@/components/Assistant";
import { VoiceToggle } from "@/components/VoiceToggle";
import { Button } from "@/components/Button";
import type { FaceScannerProps, ScanShots } from "@/components/faceScannerTypes";
import { color, font, space } from "@/theme";

// ───────────── configurare ─────────────

// Librăria se încarcă de pe CDN la rulare (nu e împachetată de Metro: bundle-ul ei conține un import() dinamic pe care
// Metro nu îl poate procesa). Versiunea e fixată; pachetul din package.json (devDependency) dă doar tipurile.
const MEDIAPIPE_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
const BUNDLE_URL = `${MEDIAPIPE_BASE}/vision_bundle.mjs`;
const WASM_URL = `${MEDIAPIPE_BASE}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const LOAD_TIMEOUT_MS = 30000;
const DETECT_EVERY_MS = 45;
const LIGHT_EVERY_N = 5;
const MANUAL_AFTER_MS = 8000;
const TICKS = 72;

const POSE = {
  frontYaw: 12,
  frontPitch: 18,
  frontRoll: 14,
  sideMin: 20,
  sideMax: 62,
  sidePitch: 28,
  downMin: 12,
  downMax: 48,
  downYaw: 22,
};

type StepId = "front" | "sideA" | "sideB" | "down";
type Tone = "bad" | "info" | "ok";

const MSG = {
  loading: { text: "Pornesc scanarea 3D…", spoken: "", tone: "info" },
  no_face: { text: "Nu văd nicio față. Privește în cameră.", spoken: "Nu văd nicio față. Privește în cameră.", tone: "bad" },
  measuring: { text: "Măsor lumina…", spoken: "", tone: "info" },
  too_close: { text: "Prea aproape. Îndepărtează telefonul.", spoken: "Ești prea aproape. Îndepărtează puțin telefonul.", tone: "bad" },
  too_far: { text: "Prea departe. Apropie-te.", spoken: "Ești prea departe. Apropie-te puțin.", tone: "bad" },
  cut_off: { text: "Fața iese din cadru.", spoken: "Fața iese din cadru. Centreaz-o în oval.", tone: "bad" },
  off_center: { text: "Centrează fața în oval.", spoken: "Centrează fața în oval.", tone: "bad" },
  too_dark: { text: "Prea întuneric.", spoken: "E prea întuneric. Mută-te spre o sursă de lumină.", tone: "bad" },
  backlit: { text: "Lumina e în spatele tău.", spoken: "Lumina e în spatele tău. Întoarce-te cu fața spre ea.", tone: "bad" },
  too_bright: { text: "Lumină prea puternică.", spoken: "Lumina e prea puternică. Mută-te la o lumină mai blândă.", tone: "bad" },
  uneven: { text: "Lumina cade doar pe o parte a feței.", spoken: "Lumina cade doar pe o parte a feței. Caută o lumină mai uniformă.", tone: "bad" },
  eyes_closed: { text: "Ține ochii deschiși.", spoken: "Ține ochii deschiși.", tone: "bad" },
  mouth_open: { text: "Închide gura, față relaxată.", spoken: "Închide gura, cu fața relaxată.", tone: "bad" },
  smiling: { text: "Relaxează fața, fără zâmbet.", spoken: "Relaxează fața, fără zâmbet.", tone: "bad" },
  pose_front: { text: "Privește drept în cameră.", spoken: "Privește drept în cameră.", tone: "info" },
  pose_pitch: { text: "Ține bărbia dreaptă.", spoken: "Ține bărbia dreaptă, nici în sus, nici în jos.", tone: "info" },
  pose_roll: { text: "Îndreaptă capul, fără înclinare.", spoken: "Îndreaptă capul, fără să-l înclini într-o parte.", tone: "info" },
  turn_left: { text: "Întoarce încet capul spre stânga ta.", spoken: "Întoarce încet capul spre stânga ta, cam 45 de grade.", tone: "info" },
  turn_right: { text: "Întoarce încet capul spre dreapta ta.", spoken: "Acum întoarce încet capul spre dreapta ta, cam 45 de grade.", tone: "info" },
  turn_back: { text: "Prea mult, revino puțin.", spoken: "Prea mult. Întoarce puțin capul înapoi.", tone: "info" },
  tilt_down: { text: "Înclină încet capul în jos.", spoken: "Acum înclină încet capul în jos, ca să văd linia părului.", tone: "info" },
  tilt_back: { text: "Prea mult, ridică puțin capul.", spoken: "Prea mult. Ridică puțin capul.", tone: "info" },
  blurry: { text: "Stai nemișcat…", spoken: "", tone: "info" },
  hold: { text: "Perfect, stai nemișcat.", spoken: "Perfect, stai nemișcat.", tone: "ok" },
  settling: { text: "Gata! Încă puțin…", spoken: "", tone: "ok" },
  retry_light: { text: "Poza nu a ieșit bine, reîncerc.", spoken: "", tone: "bad" },
} as const satisfies Record<string, { text: string; spoken: string; tone: Tone }>;

type MsgId = keyof typeof MSG;

const STEP_TITLE: Record<StepId, string> = {
  front: "Din față",
  sideA: "Profil",
  sideB: "Celălalt profil",
  down: "Capul în jos",
};

// ───────────── tipuri interne ─────────────

type Mode = "loading" | "3d" | "basic" | "denied";

type Ui = {
  msg: MsgId;
  step: StepId;
  hold: number; // 0–1, progresul ținerii poziției
  overall: number; // 0–1
  value: number | null; // valoarea afișată pe indicator (grade)
  faceSeen: boolean;
  manual: boolean; // arată butonul „Fă poza acum”
  canSkip: boolean;
};

type Runtime = {
  steps: StepId[];
  stepIdx: number;
  sideASign: number;
  shots: Partial<Record<"front" | "left" | "right" | "down", string>>;
  holdStart: number | null;
  badSince: number | null;
  eyesClosedSince: number | null;
  mouthOpenSince: number | null;
  blinking: boolean; // ochii sunt închiși chiar acum (clipit): nu facem poza în acel moment
  settleUntil: number;
  stepStartedAt: number;
  lighting: LightingReport | null;
  frontLighting: LightingReport | null;
  bestSharp: number;
  frame: number;
  yawFlip: number;
  yawVotes: number;
  pitchFlip: number;
  pitchVotes: number;
  frontPitch: number;
  lastLm: Pt[] | null;
  lastYaw: number;
  lastPitch: number;
  lastSource: "matrix" | "landmarks";
  capturing: boolean;
  forced: boolean;
  done: boolean;
  msg: MsgId;
  msgSince: number;
  spokenId: string | null;
  spokenAt: number;
  lastUiAt: number;
};

function newRuntime(): Runtime {
  return {
    steps: ["front", "sideA", "sideB", "down"],
    stepIdx: 0,
    sideASign: 0,
    shots: {},
    holdStart: null,
    badSince: null,
    eyesClosedSince: null,
    mouthOpenSince: null,
    blinking: false,
    settleUntil: 0,
    stepStartedAt: Date.now(),
    lighting: null,
    frontLighting: null,
    bestSharp: 0,
    frame: 0,
    yawFlip: 1,
    yawVotes: 0,
    pitchFlip: 1,
    pitchVotes: 0,
    frontPitch: 0,
    lastLm: null,
    lastYaw: 0,
    lastPitch: 0,
    lastSource: "landmarks",
    capturing: false,
    forced: false,
    done: false,
    msg: "loading",
    msgSince: Date.now(),
    spokenId: null,
    spokenAt: 0,
    lastUiAt: 0,
  };
}

// ───────────── componenta ─────────────

export function FaceScanner({ onComplete, onCancel }: FaceScannerProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const ch = Math.round(Math.min(640, Math.max(320, screenH - 320)));
  const cw = Math.round(Math.min(ch * 0.75, screenW - 32));

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const R = useRef<Runtime>(newRuntime());
  const sizeRef = useRef({ cw, ch });
  sizeRef.current = { cw, ch };
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<Ui>({
    msg: "loading",
    step: "front",
    hold: 0,
    overall: 0,
    value: null,
    faceSeen: false,
    manual: false,
    canSkip: false,
  });

  const modeRef = useRef<Mode>("loading");
  const captureRef = useRef<(force: boolean) => void>(() => {});
  const skipRef = useRef<() => void>(() => {});

  // ───── voce: mesajele stabile, fără repetări obositoare ─────
  useEffect(() => {
    const id = setInterval(() => {
      const r = R.current;
      const now = Date.now();
      const m = MSG[r.msg];
      if (!m.spoken) return;
      if (now - r.msgSince < 600) return; // mesajul trebuie să fie stabil
      if (now - r.spokenAt < 2200) return;
      if (r.spokenId === r.msg && now - r.spokenAt < 12000) return;
      r.spokenId = r.msg;
      r.spokenAt = now;
      speak(m.spoken, { caption: m.text });
    }, 500);
    return () => {
      clearInterval(id);
      stopSpeaking();
    };
  }, []);

  // ───── camera + model + bucla de detecție ─────
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let landmarker: FaceLandmarkerType | null = null;
    let tessellation: { start: number; end: number }[] = [];
    const lightCanvas = document.createElement("canvas");
    const lightCtx = lightCanvas.getContext("2d", { willReadFrequently: true });
    const r = R.current;

    const setMsg = (id: MsgId) => {
      if (r.msg !== id) {
        r.msg = id;
        r.msgSince = Date.now();
      }
    };

    const dpr = Math.min(2, window.devicePixelRatio || 1);

    function measureLighting(v: HTMLVideoElement, lm: Pt[], frontal: boolean): LightingReport | null {
      if (!lightCtx) return null;
      const W = 320;
      const H = Math.max(2, Math.round((W * v.videoHeight) / v.videoWidth));
      if (lightCanvas.width !== W || lightCanvas.height !== H) {
        lightCanvas.width = W;
        lightCanvas.height = H;
      }
      lightCtx.drawImage(v, 0, 0, W, H);
      const img = lightCtx.getImageData(0, 0, W, H);
      return analyzeLighting(img, lm, frontal);
    }

    function currentStep(): StepId {
      return r.steps[r.stepIdx];
    }

    function advance() {
      r.stepIdx++;
      r.holdStart = null;
      r.badSince = null;
      r.bestSharp = 0;
      r.stepStartedAt = Date.now();
      r.settleUntil = Date.now() + 1100;
      // pasul „în jos” cere pitch din matrice; fără ea îl sărim
      if (r.steps[r.stepIdx] === "down" && r.lastSource !== "matrix") r.stepIdx++;
      if (r.stepIdx >= r.steps.length) finish();
    }

    function finish() {
      if (r.done) return;
      r.done = true;
      const shots = r.shots;
      if (!shots.front) return;
      const out: ScanShots = { front: shots.front, left: shots.left, right: shots.right, down: shots.down };
      const poses = Object.values(out).filter(Boolean).length;
      cleanupMedia();
      onCompleteRef.current(out, {
        mode: modeRef.current === "basic" ? "basic" : "3d",
        poses,
        faceMean: r.frontLighting?.faceMean,
        asymmetry: r.frontLighting?.asymmetry,
        forced: r.forced,
      });
    }

    function cleanupMedia() {
      cancelAnimationFrame(raf);
      try {
        stream?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignorăm */
      }
      stream = null;
      try {
        landmarker?.close();
      } catch {
        /* ignorăm */
      }
      landmarker = null;
    }

    async function cropToBlobUrl(v: HTMLVideoElement, lm: Pt[] | null): Promise<string> {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      let sx: number, sy: number, sw: number, sh: number;
      if (lm) {
        ({ sx, sy, sw, sh } = portraitCrop(lm, vw, vh));
      } else {
        const { cw: w, ch: h } = sizeRef.current;
        const target = w / h;
        if (vw / vh > target) {
          sh = vh;
          sw = vh * target;
          sx = (vw - sw) / 2;
          sy = 0;
        } else {
          sw = vw;
          sh = vw / target;
          sx = 0;
          sy = (vh - sh) / 2;
        }
      }
      const outH = Math.min(1280, Math.round(sh));
      const outW = Math.round(outH * (sw / sh));
      const c = document.createElement("canvas");
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponibil");
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob: Blob = await new Promise((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Nu am putut crea imaginea"))), "image/jpeg", 0.92),
      );
      return URL.createObjectURL(blob);
    }

    async function capture(force: boolean) {
      const v = videoRef.current;
      if (!v || r.capturing || r.done) return;
      const step = currentStep();
      const lm = r.lastLm;
      if (modeRef.current === "3d" && !lm) return;
      r.capturing = true;
      try {
        // reverificăm lumina chiar în momentul capturii
        if (!force && lm) {
          const fresh = measureLighting(v, lm, step === "front");
          if (fresh && (fresh.issues.includes("too_dark") || fresh.issues.includes("too_bright"))) {
            setMsg("retry_light");
            r.holdStart = null;
            r.settleUntil = Date.now() + 1200;
            return;
          }
          if (step === "front" && fresh) r.lighting = fresh;
        }
        const url = await cropToBlobUrl(v, modeRef.current === "3d" ? lm : null);
        if (cancelled) return;

        const sign = r.lastYaw >= 0 ? 1 : -1;
        if (step === "front") {
          r.shots.front = url;
          r.frontLighting = r.lighting;
          r.frontPitch = r.lastPitch;
        } else if (step === "sideA") {
          const s = Math.abs(r.lastYaw) >= 10 ? sign : 1;
          r.sideASign = s;
          r.shots[s > 0 ? "left" : "right"] = url;
        } else if (step === "sideB") {
          const s = r.sideASign ? -r.sideASign : -1;
          r.shots[s > 0 ? "left" : "right"] = url;
        } else {
          r.shots.down = url;
        }
        if (force) r.forced = true;
        try {
          navigator.vibrate?.(25);
        } catch {
          /* nu toate browserele */
        }
        setMsg("settling");
        if (modeRef.current === "basic") {
          advanceBasic();
        } else {
          advance();
        }
      } catch (e) {
        console.error("Captura a eșuat:", e);
        setMsg("retry_light");
      } finally {
        r.capturing = false;
      }
    }

    function advanceBasic() {
      r.stepIdx = r.steps.length;
      finish();
    }

    captureRef.current = (force) => {
      void capture(force);
    };
    skipRef.current = () => {
      if (currentStep() === "down") {
        r.stepIdx = r.steps.length;
        finish();
      }
    };

    // ───── evaluarea pașilor ─────
    function turnMsg(): MsgId {
      return r.sideASign > 0 ? "turn_right" : r.sideASign < 0 ? "turn_left" : "turn_left";
    }

    function evaluate(step: StepId, box: ReturnType<typeof faceBox>, lm: Pt[], blend: { categoryName: string; score: number }[] | undefined, yaw: number, pitch: number, roll: number): MsgId {
      const framing = checkFraming(box, step !== "front");
      if (framing) return framing;

      const L = r.lighting;
      if (!L) return "measuring";
      for (const issue of ["too_dark", "backlit", "too_bright", "uneven"] as const) {
        if (L.issues.includes(issue)) {
          // asimetria are sens doar din față; pe profil lumina e firesc diferită
          if (issue === "uneven" && step !== "front") continue;
          return issue;
        }
      }

      // Expresia: un clipit sau o mișcare scurtă a gurii NU oprește scanarea. Cerem ochi deschiși / gură închisă
      // doar dacă problema ține peste o secundă; zâmbetul ușor nu e deloc blocant.
      if (step === "front") {
        const ex = expressionIssues(blend);
        const now = Date.now();
        r.blinking = ex.includes("eyes_closed");
        r.eyesClosedSince = r.blinking ? (r.eyesClosedSince ?? now) : null;
        r.mouthOpenSince = ex.includes("mouth_open") ? (r.mouthOpenSince ?? now) : null;
        if (r.eyesClosedSince !== null && now - r.eyesClosedSince > 1200) return "eyes_closed";
        if (r.mouthOpenSince !== null && now - r.mouthOpenSince > 800) return "mouth_open";
      } else {
        r.blinking = false;
      }

      const ay = Math.abs(yaw);
      switch (step) {
        case "front":
          if (ay > POSE.frontYaw) return "pose_front";
          if (Math.abs(pitch) > POSE.frontPitch) return "pose_pitch";
          if (Math.abs(roll) > POSE.frontRoll) return "pose_roll";
          break;
        case "sideA":
          if (ay < POSE.sideMin) return "turn_left";
          if (ay > POSE.sideMax) return "turn_back";
          if (Math.abs(pitch) > POSE.sidePitch) return "pose_pitch";
          break;
        case "sideB": {
          const wrongWay = r.sideASign !== 0 && Math.sign(yaw) === r.sideASign && ay >= 10;
          if (wrongWay || ay < POSE.sideMin) return turnMsg();
          if (ay > POSE.sideMax) return "turn_back";
          if (Math.abs(pitch) > POSE.sidePitch) return "pose_pitch";
          break;
        }
        case "down": {
          const rel = pitch - r.frontPitch;
          if (ay > POSE.downYaw) return "pose_front";
          if (rel > -POSE.downMin) return "tilt_down";
          if (rel < -POSE.downMax) return "tilt_back";
          break;
        }
      }

      if (isBlurry(L.sharpness, r.bestSharp)) return "blurry";
      return "hold";
    }

    function holdMs(step: StepId) {
      return step === "front" ? 450 : step === "down" ? 400 : 350;
    }

    // ───── desenarea suprapunerii ─────
    function draw(ctx: CanvasRenderingContext2D, lm: Pt[] | null, view: ReturnType<typeof makeViewMap> | null, now: number, hold: number, overall: number) {
      const { cw: w, ch: h } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 0.47;
      const ry = Math.min(h * 0.36, (w * 0.46) / 0.78);
      const rx = ry * 0.78;

      // întunecăm tot în afara ovalului
      ctx.fillStyle = "rgba(28,20,16,0.5)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // inelul de gradații (se aprinde pe măsură ce avansează scanarea)
      const lit = overall * TICKS;
      const current = hold * (1 / Math.max(1, r.steps.length)) * TICKS;
      for (let i = 0; i < TICKS; i++) {
        const a = -Math.PI / 2 + (i / TICKS) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const x0 = cx + (rx + 8) * ca;
        const y0 = cy + (ry + 8) * sa;
        const x1 = cx + (rx + 18) * ca;
        const y1 = cy + (ry + 18) * sa;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.strokeStyle =
          i < lit ? "#8FBF86" : i < lit + current ? color.glow : "rgba(250,246,240,0.3)";
        ctx.stroke();
      }

      if (!lm || !view || tessellation.length === 0) return;

      // mesh-ul 3D, cu o bandă luminoasă care scanează fața
      const xs = new Float32Array(lm.length);
      const ys = new Float32Array(lm.length);
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < lm.length; i++) {
        const p = view(lm[i].x, lm[i].y);
        xs[i] = p.x * w;
        ys[i] = p.y * h;
        if (ys[i] < minY) minY = ys[i];
        if (ys[i] > maxY) maxY = ys[i];
      }
      const bandCenter = minY + (((now / 1700) % 1) * (maxY - minY));
      const bandHalf = (maxY - minY) * 0.07;

      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(250,240,220,0.2)";
      ctx.beginPath();
      for (const c of tessellation) {
        const my = (ys[c.start] + ys[c.end]) / 2;
        if (Math.abs(my - bandCenter) < bandHalf) continue;
        ctx.moveTo(xs[c.start], ys[c.start]);
        ctx.lineTo(xs[c.end], ys[c.end]);
      }
      ctx.stroke();

      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(255,205,120,0.9)";
      ctx.beginPath();
      for (const c of tessellation) {
        const my = (ys[c.start] + ys[c.end]) / 2;
        if (Math.abs(my - bandCenter) >= bandHalf) continue;
        ctx.moveTo(xs[c.start], ys[c.start]);
        ctx.lineTo(xs[c.end], ys[c.end]);
      }
      ctx.stroke();
    }

    function pushUi(patch: Partial<Ui>, force = false) {
      const now = Date.now();
      if (!force && now - r.lastUiAt < 110) return;
      r.lastUiAt = now;
      setUi((u) => {
        const next = { ...u, ...patch };
        return next;
      });
    }

    // ───── modul simplu: o poză, declanșare manuală ─────
    function basicTick(v: HTMLVideoElement, now: number) {
      if (!lightCtx || v.readyState < 2 || now - r.lastUiAt < 400) return;
      const W = 64;
      const H = Math.max(2, Math.round((W * v.videoHeight) / v.videoWidth));
      lightCanvas.width = W;
      lightCanvas.height = H;
      lightCtx.drawImage(v, 0, 0, W, H);
      const d = lightCtx.getImageData(W * 0.3, H * 0.25, W * 0.4, H * 0.5).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const mean = s / (d.length / 4);
      const id: MsgId = mean < 60 ? "too_dark" : mean > 215 ? "too_bright" : "hold";
      const octx = canvasRef.current?.getContext("2d");
      if (octx) draw(octx, null, null, now, 0, 0);
      setMsg(id);
      r.lastUiAt = now;
      setUi((u) => ({ ...u, msg: id, faceSeen: true, manual: true }));
    }

    // ───── bucla principală ─────
    let lastDetect = 0;
    let lastVideoTime = -1;
    let lastFrameUi = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      const canvas = canvasRef.current;
      if (!v || !canvas || v.readyState < 2 || r.done) return;
      const nowPerf = performance.now();

      if (modeRef.current === "basic") {
        basicTick(v, Date.now());
        return;
      }
      if (!landmarker) return;
      if (nowPerf - lastDetect < DETECT_EVERY_MS) return;
      if (v.currentTime === lastVideoTime) return;
      lastVideoTime = v.currentTime;
      lastDetect = nowPerf;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { cw: w, ch: h } = sizeRef.current;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      if (!vw || !vh) return;

      let result;
      try {
        result = landmarker.detectForVideo(v, nowPerf);
      } catch (e) {
        console.error("detectForVideo a eșuat:", e);
        return;
      }

      const now = Date.now();
      const step = currentStep();
      const stepsTotal = r.steps.length;
      const overallBase = r.stepIdx / stepsTotal;

      const raw = result.faceLandmarks?.[0] as NormalizedLandmark[] | undefined;
      if (!raw) {
        r.lastLm = null;
        r.holdStart = null;
        draw(ctx, null, null, nowPerf, 0, overallBase);
        setMsg("no_face");
        pushUi({ msg: "no_face", step, hold: 0, overall: overallBase, value: null, faceSeen: false, manual: false, canSkip: step === "down" });
        return;
      }
      const lm = raw as unknown as Pt[];
      r.lastLm = lm;

      const view = makeViewMap(vw, vh, w, h, true);
      const box = faceBox(lm, view);
      const matrix = result.facialTransformationMatrixes?.[0]?.data;
      const pose = estimatePose(lm, matrix, vh / vw);
      r.lastSource = pose.source;

      // Semnul yaw/pitch din matrice îl verificăm față de estimarea din puncte (convenția MediaPipe nu o putem testa aici).
      let yaw = pose.yaw;
      let pitch = pose.pitch;
      if (pose.source === "matrix") {
        const lmYaw = estimatePose(lm, null, vh / vw).yaw;
        if (Math.abs(lmYaw) > 14 && Math.abs(pose.yaw) > 14) r.yawVotes += Math.sign(lmYaw) === Math.sign(pose.yaw) ? 1 : -1;
        const lmPitch = pitchFromLandmarks(lm, vh / vw);
        if (Math.abs(lmPitch) > 10 && Math.abs(pose.pitch) > 10) r.pitchVotes += Math.sign(lmPitch) === Math.sign(pose.pitch) ? 1 : -1;
        r.yawFlip = r.yawVotes < -3 ? -1 : 1;
        r.pitchFlip = r.pitchVotes < -3 ? -1 : 1;
        yaw *= r.yawFlip;
        pitch *= r.pitchFlip;
      }
      r.lastYaw = yaw;
      r.lastPitch = pitch;

      // lumina, doar la fiecare a N-a detecție
      r.frame++;
      if (r.frame % LIGHT_EVERY_N === 1 || !r.lighting) {
        const rep = measureLighting(v, lm, step === "front");
        if (rep) {
          r.lighting = rep;
          if (rep.sharpness > r.bestSharp) r.bestSharp = rep.sharpness;
        }
      }

      const msg = r.capturing || now < r.settleUntil
        ? (r.msg === "retry_light" ? "retry_light" : "settling")
        : evaluate(step, box, lm, result.faceBlendshapes?.[0]?.categories, yaw, pitch, pose.roll);

      // ținerea poziției
      let hold = 0;
      if (!r.capturing && now >= r.settleUntil) {
        if (msg === "hold") {
          r.badSince = null;
          if (r.holdStart === null) r.holdStart = now;
          hold = Math.min(1, (now - r.holdStart) / holdMs(step));
          // Dacă tocmai clipești, așteptăm să deschizi ochii (poza rămâne „gata”, fără să reiei numărătoarea).
          if (hold >= 1 && !r.blinking) {
            r.holdStart = null;
            void capture(false);
          }
        } else {
          if (r.badSince === null) r.badSince = now;
          if (now - r.badSince > 500) r.holdStart = null; // mici sincope nu resetează
          if (r.holdStart !== null) hold = Math.min(1, (now - r.holdStart) / holdMs(step));
        }
      }

      setMsg(msg);
      const overall = Math.min(1, overallBase + (hold * 0.9) / stepsTotal);
      draw(ctx, lm, view, nowPerf, hold, overall);

      const value = step === "down" ? pitch - r.frontPitch : yaw;
      const stuckFor = now - r.stepStartedAt;
      if (now - lastFrameUi > 100) {
        lastFrameUi = now;
        pushUi(
          {
            msg,
            step,
            hold,
            overall,
            value,
            faceSeen: true,
            manual: stuckFor > MANUAL_AFTER_MS && !checkFraming(box, true),
            canSkip: step === "down",
          },
          true,
        );
      }
    };

    // ───── pornire ─────
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("secure");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
      } catch (e) {
        if (cancelled) return;
        const secure = e instanceof Error && e.message === "secure";
        setError(
          secure
            ? "Camera nu poate fi folosită aici. Deschide aplicația printr-o conexiune sigură (https) sau pe localhost."
            : "Nu am acces la cameră. Permite accesul din bara browserului și încearcă din nou.",
        );
        modeRef.current = "denied";
        setMode("denied");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        try {
          await v.play();
        } catch {
          /* autoplay blocat: se pornește la prima atingere, dar muted+playsInline de obicei merge */
        }
      }
      raf = requestAnimationFrame(loop);

      // modelul se încarcă în paralel cu camera
      try {
        const loadModel = async () => {
          // `new Function` ascunde import()-ul de analiza statică a lui Metro; browserul îl execută normal.
          const importer = new Function("u", "return import(u)") as (u: string) => Promise<typeof Vision>;
          const vision = await importer(BUNDLE_URL);
          const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
          const make = (delegate: "GPU" | "CPU") =>
            vision.FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MODEL_URL, delegate },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
            });
          let lmk: FaceLandmarkerType;
          try {
            lmk = await make("GPU");
          } catch {
            lmk = await make("CPU");
          }
          tessellation = vision.FaceLandmarker.FACE_LANDMARKS_TESSELATION as { start: number; end: number }[];
          return lmk;
        };
        const lmk = await Promise.race([
          loadModel(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT_MS)),
        ]);
        if (cancelled) {
          lmk.close();
          return;
        }
        landmarker = lmk;
        modeRef.current = "3d";
        setMode("3d");
        setMsg("pose_front");
      } catch (e) {
        console.error("Modelul 3D nu a putut fi încărcat, trecem pe modul simplu:", e);
        if (cancelled) return;
        r.steps = ["front"];
        modeRef.current = "basic";
        setMode("basic");
      }
    })();

    return () => {
      cancelled = true;
      cleanupMedia();
    };
  }, []);

  // ───── UI ─────
  const message = MSG[ui.msg];
  const stepTitle = STEP_TITLE[ui.step];
  const stepNumber = R.current.steps.indexOf(ui.step) + 1;

  const zone = useMemo(() => {
    // indicator în oglindă: yaw pozitiv (stânga ta) apare în stânga ecranului
    if (ui.step === "front") return [{ from: -POSE.frontYaw, to: POSE.frontYaw }];
    if (ui.step === "down") return [{ from: POSE.downMin, to: POSE.downMax }];
    const a = R.current.sideASign;
    if (ui.step === "sideB" && a) {
      // al doilea profil e de partea opusă primului
      return a > 0
        ? [{ from: -POSE.sideMax, to: -POSE.sideMin }]
        : [{ from: POSE.sideMin, to: POSE.sideMax }];
    }
    return [
      { from: -POSE.sideMax, to: -POSE.sideMin },
      { from: POSE.sideMin, to: POSE.sideMax },
    ];
  }, [ui.step]);

  const meterRange = ui.step === "down" ? 50 : 70;
  const meterValue = ui.value === null ? null : ui.step === "down" ? -ui.value : ui.value;
  // axa: valoarea mare pozitivă (stânga ta / capul în jos) se desenează în stânga indicatorului, ca într-o oglindă
  const pos = (v: number) => `${50 - (Math.max(-meterRange, Math.min(meterRange, v)) / meterRange) * 50}%` as const;

  const onShutter = useCallback(() => captureRef.current(true), []);
  const onSkip = useCallback(() => skipRef.current(), []);

  const videoEl = createElement("video", {
    ref: videoRef,
    playsInline: true,
    muted: true,
    autoPlay: true,
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transform: "scaleX(-1)",
      background: "#000",
    },
  });
  const canvasEl = createElement("canvas", {
    ref: canvasRef,
    width: Math.round(cw * Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)),
    height: Math.round(ch * Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)),
    style: { position: "absolute", inset: 0, width: "100%", height: "100%" },
  });

  const toneStyle = message.tone === "ok" ? styles.chipOk : message.tone === "bad" ? styles.chipBad : styles.chipInfo;
  const loadingModel = mode === "loading";

  if (mode === "denied") {
    return (
      <View style={styles.root}>
        <View style={styles.deniedBox}>
          <Text style={styles.deniedTitle}>Nu pot porni camera</Text>
          <Text style={styles.deniedText}>{error}</Text>
          <Button label="Înapoi" onPress={onCancel} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { width: cw }]}>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityLabel="Închide">
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <Text style={styles.modeTag}>{mode === "3d" ? "SCANARE 3D" : mode === "basic" ? "MOD SIMPLU" : "SE PORNEȘTE"}</Text>
        <VoiceToggle dark />
      </View>

      <View style={[styles.stage, { width: cw, height: ch }]}>
        {videoEl}
        {canvasEl}
        {loadingModel && (
          <View style={styles.loadingVeil} pointerEvents="none">
            <Text style={styles.loadingText}>Pregătesc scanarea 3D…</Text>
            <Text style={styles.loadingSub}>Prima dată durează câteva secunde</Text>
          </View>
        )}
        {mode !== "loading" && (
          <Animated.View key={ui.msg} entering={FadeIn.duration(180)} style={[styles.chip, toneStyle]} pointerEvents="none">
            <Text style={styles.chipText}>{mode === "basic" && ui.msg === "hold" ? "Încadrează fața în oval" : message.text}</Text>
          </Animated.View>
        )}
      </View>

      <View style={[styles.panel, { width: cw }]}>
        <View style={styles.panelHead}>
          <Assistant size={44} bubble={false} />
          <View style={{ flex: 1 }}>
            {mode === "3d" ? (
              <Text style={styles.stepLabel}>
                PASUL {Math.max(1, stepNumber)} DIN {R.current.steps.length} · {stepTitle.toUpperCase()}
              </Text>
            ) : (
              <Text style={styles.stepLabel}>POZĂ SIMPLĂ</Text>
            )}
            <Text style={styles.panelText}>
              {mode === "basic"
                ? "Scanarea 3D nu a putut porni aici. Încadrează fața în oval, cu lumina în față, și fă poza."
                : message.text}
            </Text>
          </View>
        </View>

        {mode === "3d" && (
          <View style={styles.meter}>
            {zone.map((z, i) => (
              <View
                key={i}
                style={[
                  styles.zone,
                  {
                    left: pos(Math.max(z.from, z.to)),
                    width: `${(Math.abs(z.to - z.from) / meterRange) * 50}%`,
                  },
                ]}
              />
            ))}
            <View style={styles.meterCenter} />
            {meterValue !== null && <View style={[styles.marker, { left: pos(meterValue) }]} />}
          </View>
        )}

        <View style={styles.actions}>
          {mode === "basic" && <Button label="Fă poza" onPress={onShutter} />}
          {mode === "3d" && ui.manual && <Button label="Fă poza acum" variant="secondary" onPress={onShutter} />}
          {mode === "3d" && ui.canSkip && <Button label="Sari peste" variant="ghost" onPress={onSkip} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.sm },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  close: { color: color.paper, fontSize: 20, fontFamily: font.bodySemibold },
  modeTag: { color: color.glow, fontFamily: font.bodySemibold, fontSize: 12, letterSpacing: 1.2 },
  stage: { borderRadius: 24, overflow: "hidden", backgroundColor: "#000", position: "relative" },
  loadingVeil: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(28,20,16,0.7)", gap: 6 },
  loadingText: { color: color.paper, fontFamily: font.display, fontSize: 20 },
  loadingSub: { color: "rgba(250,246,240,0.7)", fontFamily: font.body, fontSize: 13 },
  chip: { position: "absolute", top: 14, alignSelf: "center", paddingVertical: 7, paddingHorizontal: space.sm, borderRadius: 999, maxWidth: "92%" },
  chipOk: { backgroundColor: "rgba(75,90,69,0.92)" },
  chipBad: { backgroundColor: "rgba(155,59,46,0.92)" },
  chipInfo: { backgroundColor: "rgba(28,20,16,0.82)" },
  chipText: { color: color.paper, fontFamily: font.bodySemibold, fontSize: 13, textAlign: "center" },
  panel: { gap: space.xs },
  panelHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepLabel: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.9, color: color.glow },
  panelText: { fontFamily: font.display, fontSize: 18, lineHeight: 24, color: color.paper },
  meter: { height: 10, borderRadius: 5, backgroundColor: "rgba(250,246,240,0.14)", position: "relative", overflow: "hidden" },
  zone: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(143,191,134,0.5)" },
  meterCenter: { position: "absolute", left: "50%", top: 2, bottom: 2, width: 1, backgroundColor: "rgba(250,246,240,0.4)" },
  marker: { position: "absolute", top: 0, bottom: 0, width: 10, marginLeft: -5, borderRadius: 5, backgroundColor: color.paper },
  actions: { gap: space.xs },
  deniedBox: { gap: space.sm, padding: space.md, maxWidth: 420 },
  deniedTitle: { color: color.paper, fontFamily: font.display, fontSize: 24 },
  deniedText: { color: "rgba(250,246,240,0.8)", fontFamily: font.body, fontSize: 15, lineHeight: 22 },
});
