// Punctul unic de integrare cu analiza facială. Restul app-ului apelează doar runScan().
//
// - Implicit: Edge Function `scan-face` (YouCam / Perfect Corp). Cheia API stă doar
//   ca secret în Supabase, niciodată în aplicație.
// - EXPO_PUBLIC_USE_MOCK_SCAN=true: date fixe, fără apel extern (pt. teste de UI).
//
// Imaginea nu se salvează în Supabase în niciun caz.

import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import type { ScanShots } from "@/components/faceScannerTypes";

export type ScanQuality = { ok: boolean; issue: string | null };

export interface ScanOutcome {
  scanId: string;
  /** Calitatea pozei, cum a văzut-o modelul (lumină, distanță, claritate). */
  quality: ScanQuality;
  /** Ce unghiuri a folosit efectiv analiza (ex. ["front","left","right"]). */
  anglesUsed: string[];
}

const FIELD_FOR: Record<keyof ScanShots, string> = {
  front: "image",
  left: "image_left",
  right: "image_right",
};

const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK_SCAN === "true";

// Mesaje prietenoase pentru codurile de eroare de calitate a pozei (YouCam).
const FRIENDLY_ERRORS: Record<string, string> = {
  error_src_face_too_small: "Fața e prea departe. Apropie-te, fața trebuie să ocupe cam 60–80% din lățimea pozei.",
  error_src_face_out_of_bound: "Fața iese din cadru. Centreaz-o și încearcă din nou.",
  error_lighting_dark: "Lumina e prea slabă. Mută-te într-un loc bine luminat.",
  error_below_min_image_size: "Poza are rezoluție prea mică.",
  error_exceed_max_image_size: "Poza are rezoluție prea mare.",
};

const SESSION_EXPIRED = "Nu ești autentificat sau sesiunea a expirat. Intră din nou în cont și repetă scanarea.";

async function runEdgeScan(shots: ScanShots): Promise<ScanOutcome> {
  // Edge Function-ul cere un token de utilizator. Fără sesiune, invoke() trimite doar cheia anon
  // și funcția răspunde „unauthorized” — mai bine spunem clar de ce.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error(SESSION_EXPIRED);

  const form = new FormData();

  for (const key of Object.keys(FIELD_FOR) as (keyof ScanShots)[]) {
    const uri = shots[key];
    if (!uri) continue;
    if (Platform.OS === "web") {
      // Pe web, FormData.append cere un Blob/File adevărat; {uri, name, type} e o convenție doar a React Native nativ.
      const blob = await (await fetch(uri)).blob();
      form.append(FIELD_FOR[key], blob, `${key}.jpg`);
    } else {
      form.append(FIELD_FOR[key], { uri, name: `${key}.jpg`, type: "image/jpeg" } as unknown as Blob);
    }
  }

  const { data, error } = await supabase.functions.invoke("scan-face", { body: form });

  if (error) {
    // FunctionsHttpError păstrează răspunsul în error.context
    let code: string | undefined;
    let message = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      code = body?.code;
      message = body?.error ?? message;
    } catch {
      /* corp non-JSON */
    }
    if (message === "unauthorized") message = SESSION_EXPIRED;
    const friendly = (code && FRIENDLY_ERRORS[code]) || message;
    console.error("scan-face a eșuat:", { code, message }); // vizibil în DevTools (F12) indiferent de Alert
    throw new Error(friendly);
  }
  if (!data?.scan_id) throw new Error("Scanarea nu a întors un scan_id");
  return {
    scanId: data.scan_id as string,
    quality: { ok: data.quality?.ok !== false, issue: (data.quality?.issue as string | null) ?? null },
    anglesUsed: Array.isArray(data.angles_used) ? (data.angles_used as string[]) : ["front"],
  };
}

async function runMockScan(_shots: ScanShots): Promise<ScanOutcome> {
  await new Promise((r) => setTimeout(r, 800));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesiune expirată");

  const { data: scan, error } = await supabase
    .from("scans")
    .insert({
      user_id: user.id,
      source: "mock",
      vendor_scan_ref: `mock-${Date.now()}`,
      status: "completed",
      raw_payload_deleted: true,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !scan) throw error ?? new Error("Scan nesalvat");

  const { error: issuesError } = await supabase.from("scan_issues").insert([
    { scan_id: scan.id, issue_slug: "acne", severity: 6.5, confidence: 0.92 },
    { scan_id: scan.id, issue_slug: "dark_circles", severity: 4.0, confidence: 0.81 },
    { scan_id: scan.id, issue_slug: "hair_loss", severity: 3.2, confidence: 0.74 },
  ]);
  if (issuesError) throw issuesError;
  return { scanId: scan.id, quality: { ok: true, issue: null }, anglesUsed: ["front"] };
}

export const runScan = (shots: ScanShots): Promise<ScanOutcome> =>
  USE_MOCK ? runMockScan(shots) : runEdgeScan(shots);
