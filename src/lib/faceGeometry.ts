// Geometria scanării faciale: poziția capului, încadrarea, lumina pe fața propriu-zisă și expresia.
// Funcții pure, fără DOM și fără MediaPipe, ca să poată fi testate cu date sintetice.
//
// Intrarea: cele 478 de puncte (x, y normalizate 0–1 pe cadrul video ORIGINAL, nemirorat; z în aceeași scară ca x)
// pe care le dă MediaPipe Face Landmarker, plus matricea de transformare a feței (4x4, column-major) dacă există.
//
// Convenție folosită peste tot: yaw POZITIV = utilizatorul și-a întors capul spre STÂNGA lui
// (nasul se mută spre dreapta imaginii nemirorate); pitch POZITIV = nasul în sus.

export type Pt = { x: number; y: number; z: number };

// Indici din mesh-ul canonic MediaPipe (468 puncte + 10 pentru iris).
export const LM = {
  noseTip: 1,
  foreheadTop: 10,
  forehead: 151,
  chin: 152,
  cheekEdgeImageLeft: 234,
  cheekEdgeImageRight: 454,
  cheekPatchImageLeft: 50,
  cheekPatchImageRight: 280,
  eyeImageLeftOuter: 33,
  eyeImageLeftInner: 133,
  eyeImageRightInner: 362,
  eyeImageRightOuter: 263,
} as const;

const DEG = 180 / Math.PI;

// ───────────── poziția capului ─────────────

export type Pose = { yaw: number; pitch: number; roll: number; source: "matrix" | "landmarks" };

/**
 * Din matricea 4x4 (column-major) care duce modelul canonic al feței în spațiul camerei.
 * Fața canonică „privește” spre +Z, +X e dreapta imaginii, +Y în sus (convenția MediaPipe / OpenGL).
 */
export function poseFromMatrix(m: ArrayLike<number> | null | undefined): Pose | null {
  if (!m || m.length < 16) return null;
  const fx = m[8];
  const fy = m[9];
  const fz = m[10];
  const len = Math.hypot(fx, fy, fz);
  if (!len || !Number.isFinite(len)) return null;
  const nx = fx / len;
  const ny = fy / len;
  const nz = fz / len;
  return {
    yaw: Math.atan2(nx, nz) * DEG,
    pitch: Math.atan2(ny, Math.hypot(nx, nz)) * DEG,
    roll: Math.atan2(m[1], m[0]) * DEG,
    source: "matrix",
  };
}

/**
 * Estimare de rezervă doar din puncte (când matricea lipsește): yaw din poziția nasului între marginile obrajilor,
 * roll din linia ochilor. Pitch nu se poate estima fiabil așa, deci rămâne 0.
 * Model: nasul iese în față cu ~aceeași mărime ca jumătatea lățimii feței, deci raportul r = tan(yaw).
 */
export function poseFromLandmarks(lm: Pt[], aspect: number): Pose {
  const nose = lm[LM.noseTip];
  const l = lm[LM.cheekEdgeImageLeft];
  const r = lm[LM.cheekEdgeImageRight];
  const dL = Math.abs(nose.x - l.x);
  const dR = Math.abs(r.x - nose.x);
  const ratio = (dL - dR) / Math.max(1e-6, dL + dR);
  const yaw = Math.atan(ratio / 0.95) * DEG;

  const eyeL = mid(lm[LM.eyeImageLeftOuter], lm[LM.eyeImageLeftInner]);
  const eyeR = mid(lm[LM.eyeImageRightInner], lm[LM.eyeImageRightOuter]);
  const roll = Math.atan2((eyeR.y - eyeL.y) * aspect, eyeR.x - eyeL.x) * DEG;
  return { yaw, pitch: 0, roll, source: "landmarks" };
}

export function estimatePose(lm: Pt[], matrix: ArrayLike<number> | null | undefined, aspect: number): Pose {
  return poseFromMatrix(matrix) ?? poseFromLandmarks(lm, aspect);
}

/**
 * Pitch aproximativ din adâncimea punctelor (z mai mic = mai aproape de cameră): când privești în sus, bărbia vine în față.
 * Nu e folosit ca măsurătoare, ci doar ca să verifice SEMNUL pitch-ului din matrice pe dispozitivul real.
 */
export function pitchFromLandmarks(lm: Pt[], aspect: number): number {
  const f = lm[LM.forehead];
  const c = lm[LM.chin];
  const dy = Math.abs(f.y - c.y) * aspect; // aspect = înălțime/lățime: y e normalizat pe înălțime, z pe lățime
  return Math.atan2(f.z - c.z, dy) * DEG;
}

function mid(a: Pt, b: Pt) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ───────────── încadrare ─────────────

/** Transformă coordonate de cadru (0–1) în coordonate de ecran (0–1) ținând cont de `object-fit: cover` și de oglindire. */
export type View = (nx: number, ny: number) => { x: number; y: number };

export function makeViewMap(vw: number, vh: number, cw: number, ch: number, mirror: boolean): View {
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return (nx, ny) => {
    let x = ox + nx * dw;
    const y = oy + ny * dh;
    if (mirror) x = cw - x;
    return { x: x / cw, y: y / ch };
  };
}

export type Box = { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number; w: number; h: number };

export function faceBox(lm: Pt[], view: View): Box {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of lm) {
    const v = view(p.x, p.y);
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

export type FramingIssue = "too_close" | "too_far" | "cut_off" | "off_center";

export const FRAMING = { tooClose: 0.82, tooFar: 0.36, edge: 0.0, centerX: 0.16, centerY: 0.18 };

/** `relaxedCenter`: la poziții din profil fața se deplasează natural, deci toleranța la centrare crește. */
export function checkFraming(box: Box, relaxedCenter = false): FramingIssue | null {
  if (box.h > FRAMING.tooClose) return "too_close";
  if (box.h < FRAMING.tooFar) return "too_far";
  const e = FRAMING.edge;
  if (box.minX < e || box.maxX > 1 - e || box.minY < e || box.maxY > 1 - e) return "cut_off";
  const k = relaxedCenter ? 1.6 : 1;
  if (Math.abs(box.cx - 0.5) > FRAMING.centerX * k || Math.abs(box.cy - 0.5) > FRAMING.centerY * k) return "off_center";
  return null;
}

/**
 * Decupaj portret 3:4 în jurul feței (în pixeli ai videoclipului), cu loc deasupra pentru linia părului.
 * Fața ocupă astfel mult mai mult din imaginea trimisă la analiză decât într-un cadru întreg de webcam.
 */
export function portraitCrop(lm: Pt[], vw: number, vh: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const faceW = (maxX - minX) * vw;
  const faceH = (maxY - minY) * vh;
  const cx = ((minX + maxX) / 2) * vw;
  const cy = ((minY + maxY) / 2) * vh - faceH * 0.08; // puțin mai sus, ca să includă părul

  let sh = faceH * 2;
  let sw = sh * 0.75;
  if (sw < faceW * 1.4) {
    sw = faceW * 1.4;
    sh = sw / 0.75;
  }
  if (sh > vh) {
    sh = vh;
    sw = sh * 0.75;
  }
  if (sw > vw) {
    sw = vw;
    sh = sw / 0.75;
  }
  const sx = Math.min(Math.max(cx - sw / 2, 0), vw - sw);
  const sy = Math.min(Math.max(cy - sh / 2, 0), vh - sh);
  return { sx, sy, sw, sh };
}

// ───────────── lumină și claritate, măsurate pe față ─────────────

export type ImageDataLike = { data: ArrayLike<number>; width: number; height: number };
export type LightingIssue = "too_dark" | "too_bright" | "backlit" | "uneven";

export type LightingReport = {
  faceMean: number; // 0–255, media pe frunte și obraji
  leftMean: number;
  rightMean: number;
  asymmetry: number; // |stânga − dreapta| / medie
  backgroundMean: number;
  clipped: number; // fracțiunea de pixeli arși (>=250) din zonele feței
  sharpness: number; // varianța Laplacianului pe fața decupată (relativă: se compară cu cea mai bună din sesiune)
  issues: LightingIssue[];
};

export const LIGHTING = { dark: 50, bright: 228, clipped: 0.2, backlitGap: 70, backlitFace: 110, asym: 0.45 };

function lumAt(d: ArrayLike<number>, i: number) {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

function patchStats(img: ImageDataLike, cx: number, cy: number, half: number) {
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + half));
  let sum = 0;
  let clipped = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const l = lumAt(img.data, (y * img.width + x) * 4);
      sum += l;
      if (l >= 250) clipped++;
      n++;
    }
  }
  return { mean: n ? sum / n : 0, clipped: n ? clipped / n : 0 };
}

function laplacianVariance(img: ImageDataLike, x0: number, y0: number, x1: number, y1: number) {
  const xa = Math.max(1, Math.floor(x0));
  const xb = Math.min(img.width - 2, Math.ceil(x1));
  const ya = Math.max(1, Math.floor(y0));
  const yb = Math.min(img.height - 2, Math.ceil(y1));
  let s = 0;
  let sq = 0;
  let n = 0;
  const w = img.width;
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = y * w + x;
      const c = lumAt(img.data, i * 4);
      const lap =
        lumAt(img.data, (i - w) * 4) + lumAt(img.data, (i + w) * 4) + lumAt(img.data, (i - 1) * 4) + lumAt(img.data, (i + 1) * 4) - 4 * c;
      s += lap;
      sq += lap * lap;
      n++;
    }
  }
  if (!n) return 0;
  const mean = s / n;
  return sq / n - mean * mean;
}

export function analyzeLighting(img: ImageDataLike, lm: Pt[], frontal: boolean): LightingReport {
  const W = img.width;
  const H = img.height;
  const faceW = Math.abs(lm[LM.cheekEdgeImageRight].x - lm[LM.cheekEdgeImageLeft].x) * W;
  const half = Math.max(2, Math.round(faceW * 0.05));

  const at = (idx: number) => patchStats(img, lm[idx].x * W, lm[idx].y * H, half);
  const forehead = at(LM.forehead);
  const left = at(LM.cheekPatchImageLeft);
  const right = at(LM.cheekPatchImageRight);

  const faceMean = (forehead.mean + left.mean + right.mean) / 3;
  const clipped = (forehead.clipped + left.clipped + right.clipped) / 3;
  const asymmetry = Math.abs(left.mean - right.mean) / Math.max(1, (left.mean + right.mean) / 2);

  // Fundalul: benzile laterale (8% din lățime) pe mijlocul înălțimii
  const bgA = patchStatsRect(img, 0, H * 0.2, W * 0.08, H * 0.8);
  const bgB = patchStatsRect(img, W * 0.92, H * 0.2, W, H * 0.8);
  const backgroundMean = (bgA + bgB) / 2;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const sharpness = laplacianVariance(img, minX * W, minY * H, maxX * W, maxY * H);

  const issues: LightingIssue[] = [];
  if (faceMean < LIGHTING.dark) issues.push("too_dark");
  else if (backgroundMean - faceMean > LIGHTING.backlitGap && faceMean < LIGHTING.backlitFace) issues.push("backlit");
  if (faceMean > LIGHTING.bright || clipped > LIGHTING.clipped) issues.push("too_bright");
  if (frontal && asymmetry > LIGHTING.asym && !issues.includes("too_dark")) issues.push("uneven");

  return { faceMean, leftMean: left.mean, rightMean: right.mean, asymmetry, backgroundMean, clipped, sharpness, issues };
}

function patchStatsRect(img: ImageDataLike, x0: number, y0: number, x1: number, y1: number) {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(img.width - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(img.height - 1, Math.ceil(y1));
  let sum = 0;
  let n = 0;
  // pas 2 ca să fie rapid; e doar fundalul
  for (let y = ya; y <= yb; y += 2) {
    for (let x = xa; x <= xb; x += 2) {
      sum += lumAt(img.data, (y * img.width + x) * 4);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Imaginea e „mișcată” dacă claritatea a scăzut mult față de cea mai bună din sesiune (prag adaptiv, fără calibrare pe dispozitiv). */
export function isBlurry(sharpness: number, bestSoFar: number): boolean {
  return bestSoFar > 0 && sharpness < bestSoFar * 0.3;
}

// ───────────── expresie ─────────────

export type ExpressionIssue = "eyes_closed" | "mouth_open" | "smiling";

export function expressionIssues(blend: { categoryName: string; score: number }[] | undefined): ExpressionIssue[] {
  if (!blend) return [];
  const get = (name: string) => blend.find((c) => c.categoryName === name)?.score ?? 0;
  const out: ExpressionIssue[] = [];
  if ((get("eyeBlinkLeft") + get("eyeBlinkRight")) / 2 >= 0.5) out.push("eyes_closed");
  if (get("jawOpen") >= 0.4) out.push("mouth_open");
  if ((get("mouthSmileLeft") + get("mouthSmileRight")) / 2 >= 0.6) out.push("smiling");
  return out;
}
