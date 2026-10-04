// Punctul unic de integrare cu analiza facială. Restul app-ului apelează doar runScan().
//
// - Implicit: Edge Function `scan-face` (YouCam / Perfect Corp). Cheia API stă doar
//   ca secret în Supabase, niciodată în aplicație.
// - EXPO_PUBLIC_USE_MOCK_SCAN=true: date fixe, fără apel extern (pt. teste de UI).
//
// Imaginea nu se salvează în Supabase în niciun caz.

import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export interface ScanOutcome {
  scanId: string;
}

const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK_SCAN === "true";

// Mesaje prietenoase pentru codurile de eroare de calitate a pozei (YouCam).
const FRIENDLY_ERRORS: Record<string, string> = {
  error_src_face_too_small: "Fața e prea departe. Apropie-te, fața trebuie să ocupe cam 60–80% din lățimea pozei.",
  error_src_face_out_of_bound: "Fața iese din cadru. Centreaz-o și încearcă din nou.",
  error_lighting_dark: "Lumina e prea slabă. Mută-te într-un loc bine luminat.",
  error_below_min_image_size: "Poza are rezoluție prea mică.",
  error_exceed_max_image_size: "Poza are rezoluție prea mare.",
};

async function runEdgeScan(photoUri: string): Promise<ScanOutcome> {
  const form = new FormData();

  if (Platform.OS === "web") {
    // Pe web, FormData.append cere un Blob/File adevărat — un obiect simplu
    // e doar stringificat ("[object Object]"), nu trimis ca fișier.
    // {uri, name, type} de mai jos e o convenție specifică React Native
    // nativ, pe care un browser real n-o înțelege.
    const fetched = await fetch(photoUri);
    const blob = await fetched.blob();
    form.append("image", blob, "scan.jpg");
  } else {
    form.append("image", { uri: photoUri, name: "scan.jpg", type: "image/jpeg" } as unknown as Blob);
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
    const friendly = (code && FRIENDLY_ERRORS[code]) || message;
    console.error("scan-face a eșuat:", { code, message }); // vizibil în DevTools (F12) indiferent de Alert
    throw new Error(friendly);
  }
  if (!data?.scan_id) throw new Error("Scanarea nu a întors un scan_id");
  return { scanId: data.scan_id as string };
}

async function runMockScan(_photoUri: string): Promise<ScanOutcome> {
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
  return { scanId: scan.id };
}

export const runScan = (photoUri: string): Promise<ScanOutcome> =>
  USE_MOCK ? runMockScan(photoUri) : runEdgeScan(photoUri);
