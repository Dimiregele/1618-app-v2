// Verificarea calității unui cadru, direct pe telefon, fără server.
//
// Micșorăm cadrul la ~48 px lățime, îl decodăm (JPEG) și calculăm din pixeli:
//  - luminozitatea medie (prea întuneric / prea luminos),
//  - diferența dintre stânga și dreapta (lumină care vine dintr-o parte),
//  - claritatea (varianța Laplacianului) — detectează mișcarea / imaginea mișcată.
//
// Ce NU poate face: nu detectează fața (distanță, poziție, unghi). Pentru asta e nevoie de un
// detector de față nativ (ML Kit / Vision), care nu rulează în Expo Go. Vezi `FaceCheck` mai jos.

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import jpeg from "jpeg-js";

export type QualityIssue = "too_dark" | "too_bright" | "uneven_light" | "blurry";

export type QualityReport = {
  brightness: number; // 0–255
  unevenness: number; // 0–1, diferența relativă stânga/dreapta
  sharpness: number; // varianța Laplacianului pe imaginea micșorată
  issues: QualityIssue[];
  ok: boolean; // fără probleme „blocante” (întuneric / supraexpunere / lumină inegală)
};

// Praguri de pornire. Trebuie calibrate pe telefoane reale (vezi README / notele de livrare).
export const THRESHOLDS = {
  tooDark: 70,
  tooBright: 205,
  uneven: 0.28,
  blurry: 10,
};

const SAMPLE_WIDTH = 48;

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/\w+;base64,/, "");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const length = (clean.length * 3) / 4 - padding;
  const bytes = new Uint8Array(length);

  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = lookup[clean.charCodeAt(i)];
    const e2 = lookup[clean.charCodeAt(i + 1)];
    const e3 = lookup[clean.charCodeAt(i + 2)];
    const e4 = lookup[clean.charCodeAt(i + 3)];
    if (p < length) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < length) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < length) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes;
}

export async function analyzeFrame(uri: string): Promise<QualityReport> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: SAMPLE_WIDTH });
  const rendered = await context.renderAsync();
  const small = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!small.base64) throw new Error("Nu am putut citi cadrul pentru verificare");

  const { data, width, height } = jpeg.decode(base64ToBytes(small.base64), {
    useTArray: true,
    formatAsRGBA: true,
  });

  // Luminanță per pixel (Rec. 601)
  const lum = new Float32Array(width * height);
  let total = 0;
  let leftTotal = 0;
  let rightTotal = 0;
  let leftCount = 0;
  let rightCount = 0;
  const half = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lum[y * width + x] = l;
      total += l;
      if (x < half) {
        leftTotal += l;
        leftCount++;
      } else if (x >= width - half) {
        rightTotal += l;
        rightCount++;
      }
    }
  }

  const brightness = total / (width * height);
  const leftMean = leftTotal / Math.max(1, leftCount);
  const rightMean = rightTotal / Math.max(1, rightCount);
  const unevenness = Math.abs(leftMean - rightMean) / Math.max(1, brightness);

  // Varianța Laplacianului (4-vecini) pe regiunea centrală (unde e fața)
  let lapSum = 0;
  let lapSumSq = 0;
  let lapN = 0;
  const x0 = Math.floor(width * 0.2);
  const x1 = Math.floor(width * 0.8);
  const y0 = Math.floor(height * 0.15);
  const y1 = Math.floor(height * 0.85);
  for (let y = Math.max(1, y0); y < Math.min(height - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x++) {
      const c = lum[y * width + x];
      const lap =
        lum[(y - 1) * width + x] + lum[(y + 1) * width + x] + lum[y * width + x - 1] + lum[y * width + x + 1] - 4 * c;
      lapSum += lap;
      lapSumSq += lap * lap;
      lapN++;
    }
  }
  const lapMean = lapSum / Math.max(1, lapN);
  const sharpness = lapSumSq / Math.max(1, lapN) - lapMean * lapMean;

  const issues: QualityIssue[] = [];
  if (brightness < THRESHOLDS.tooDark) issues.push("too_dark");
  if (brightness > THRESHOLDS.tooBright) issues.push("too_bright");
  if (unevenness > THRESHOLDS.uneven) issues.push("uneven_light");
  if (sharpness < THRESHOLDS.blurry) issues.push("blurry");

  return {
    brightness,
    unevenness,
    sharpness,
    issues,
    ok: !issues.some((i) => i === "too_dark" || i === "too_bright" || i === "uneven_light"),
  };
}

export const ISSUE_MESSAGE: Record<QualityIssue, { short: string; spoken: string }> = {
  too_dark: {
    short: "Lumină prea slabă",
    spoken: "E prea întuneric. Mută-te într-un loc mai luminat, de preferat lângă o fereastră.",
  },
  too_bright: {
    short: "Lumină prea puternică",
    spoken: "E prea multă lumină. Ferește-te de soarele direct sau de o sursă de lumină din spatele telefonului.",
  },
  uneven_light: {
    short: "Lumină dintr-o parte",
    spoken: "Lumina vine doar dintr-o parte. Întoarce-te cu fața spre sursa de lumină.",
  },
  blurry: {
    short: "Imagine mișcată",
    spoken: "Ține telefonul nemișcat.",
  },
};

// Loc rezervat pentru un detector de față nativ (distanță, centrare, unghiul capului).
// Când se adaugă (dev build + ML Kit / Vision), se implementează aici și ecranul de scanare îl folosește.
export type FaceCheck = {
  sizeRatio: number; // lățimea feței / lățimea cadrului
  centered: boolean;
  yawDegrees: number;
};
