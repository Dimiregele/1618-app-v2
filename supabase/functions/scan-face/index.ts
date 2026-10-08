// scan-face — Groq (qwen/qwen3.8-27b), V4: analiză pe MAI MULTE UNGHIURI.
//
// Primește (multipart/form-data):
//   image        — fața din față (obligatoriu, ca până acum)
//   image_left   — profil, utilizatorul și-a întors capul spre stânga lui   (opțional)
//   image_right  — profil, spre dreapta lui                                  (opțional)
//
// Modelul acceptă cel mult 3 imagini într-o cerere, deci folosim doar aceste 3 unghiuri (față + 2 profiluri).
// Scalpul / căderea părului NU se judecă din poze: se află din chestionar. Un câmp `image_down` trimis de un client
// vechi este ignorat.

// Un client vechi care trimite doar `image` funcționează la fel ca înainte.
// Răspuns: { scan_id, quality: {ok, issue}, issues: [...], angles_used: ["front", ...] }
// Imaginile nu se salvează nicăieri; se trimit doar la modelul de analiză.

import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "qwen/qwen3.8-27b";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const KNOWN_SLUGS = [
  "acne", "dark_circles", "redness", "wrinkles", "pores",
  "texture", "oiliness", "dryness", "eye_bags", "age_spots", "hair_loss",
];

// căderea părului nu se judecă din poza feței (scalpul nu se vede); vine din chestionar
const SKIN_SLUGS = KNOWN_SLUGS.filter((s) => s !== "hair_loss");

const QUALITY_ISSUES = [
  "prea_intunecat", "prea_luminos", "fata_prea_aproape", "fata_prea_departe", "fata_neclara",
];

// câmpul din formular → eticheta unghiului + ce ajută să vedem
const ANGLES = [
  { field: "image", key: "front", label: "FAȚĂ (din față)", hint: "frunte, obraji, nas, bărbie, zona ochilor" },
  { field: "image_left", key: "left", label: "PROFIL STÂNGA", hint: "obrazul stâng, maxilar, tâmplă, textura pielii pe lateral" },
  { field: "image_right", key: "right", label: "PROFIL DREAPTA", hint: "obrazul drept, maxilar, tâmplă, textura pielii pe lateral" },
] as const;

const PROMPT = `Ești un asistent de analiză vizuală pentru o aplicație de îngrijire personală (NU diagnostic medical).
Primești una sau mai multe poze ale ACEEAȘI persoane, fiecare cu eticheta ei (față, profil stânga, profil dreapta). Folosește-le TOATE împreună: o problemă văzută din mai multe unghiuri e mai sigură decât una văzută doar dintr-unul.

PASUL 1 — CALITATEA POZEI. Evaluează în primul rând poza din FAȚĂ dacă e tehnic potrivită pt. o scanare facială:
- lumina e suficientă și echilibrată (nu prea întunecată, nu suprasaturată)
- fața e la o distanță potrivită (nu taie din cadru de aproape, nu e prea mică în poză de departe)
- fața e clară, vizibilă, nu neclară/mișcată/obstrucționată
Pozele de profil sunt prin natura lor mai puțin ideale; nu le penaliza pentru unghi.

PASUL 2 — ANALIZA. Examinează SISTEMATIC, zonă cu zonă (frunte, obraji, bărbie, zona ochilor, tâmple) și evaluează FIECARE dintre aceste categorii:
${SKIN_SLUGS.join(", ")}

Pentru fiecare, un scor de severitate 0-10 (0 = deloc vizibil, 1-3 = ușor, 4-6 = moderat, 7-10 = sever). Fii decis — nu te feri de scoruri peste 5 dacă ce vezi chiar justifică asta. Include DOAR categoriile cu scor >= 2.
NU evalua părul sau căderea părului (nu e subiectul acestei scanări). NU pune diagnostic medical — dacă vezi ceva neobișnuit, nu-l clasifica, doar adaugă o "note" generică de genul "merită verificat de un dermatolog".
Nu inventa: dacă o zonă nu se vede în nicio poză, nu o evalua.

Răspunde STRICT ca JSON, fără alt text, exact în formatul:
{"quality": {"ok": true, "issue": null}, "issues": [{"slug": "acne", "severity": 6, "note": "scurt"}]}

Dacă PASUL 1 găsește o problemă, "issue" e EXACT una dintre: ${QUALITY_ISSUES.join(", ")} (sau null dacă nu-i nicio problemă). Dacă nu găsești nimic cu scor >= 2 la pasul 2, "issues" e un array gol.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface GroqIssue { slug: string; severity: number; note?: string }
interface GroqQuality { ok: boolean; issue: string | null }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return json({ error: "GROQ_API_KEY nu e setat ca secret", code: "not_configured" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  try {
    const form = await req.formData();

    if (!(form.get("image") instanceof File)) {
      return json({ error: "Lipsește câmpul 'image'", code: "bad_request" }, 400);
    }

    // construim mesajul: pentru fiecare unghi prezent, o etichetă text urmată de imagine
    const content: unknown[] = [{ type: "text", text: PROMPT }];
    const anglesUsed: string[] = [];
    for (const a of ANGLES) {
      const file = form.get(a.field);
      if (!(file instanceof File)) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        return json({ error: "Fiecare imagine trebuie să fie sub 4MB", code: "too_large" }, 413);
      }
      const contentType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const base64 = toBase64(new Uint8Array(await file.arrayBuffer()));
      content.push({ type: "text", text: `Poza: ${a.label}. Aici se văd mai ales: ${a.hint}.` });
      content.push({ type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } });
      anglesUsed.push(a.key);
    }

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_completion_tokens: 1536,
        messages: [{ role: "user", content }],
      }),
    });

    const groqData = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) throw new Error(groqData?.error?.message ?? `Groq HTTP ${groqRes.status}`);

    const raw = groqData?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { quality?: GroqQuality; issues?: GroqIssue[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Groq a răspuns cu JSON invalid: " + String(raw).slice(0, 300));
    }

    const quality: GroqQuality = {
      ok: parsed.quality?.ok !== false,
      issue: QUALITY_ISSUES.includes(parsed.quality?.issue ?? "") ? (parsed.quality!.issue as string) : null,
    };

    const issues = (parsed.issues ?? [])
      .filter((i) => i && KNOWN_SLUGS.includes(i.slug) && typeof i.severity === "number")
      .filter((i) => SKIN_SLUGS.includes(i.slug))
      .map((i) => ({
        issue_slug: i.slug,
        severity: Math.min(10, Math.max(0, Number(i.severity.toFixed(2)))),
        raw_vendor_data: { note: i.note ?? null, angles: anglesUsed },
      }));

    const { data: scan, error: scanErr } = await supabase
      .from("scans")
      .insert({
        user_id: user.id,
        source: "groq_qwen3_vl",
        vendor_scan_ref: groqData?.id ?? null,
        status: "completed",
        raw_payload_deleted: true,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (scanErr || !scan) throw new Error(scanErr?.message ?? "Scan nesalvat");

    if (issues.length > 0) {
      const { error: issuesErr } = await supabase
        .from("scan_issues")
        .insert(issues.map((i) => ({ scan_id: scan.id, ...i })));
      if (issuesErr) throw new Error(issuesErr.message);
    }

    return json({
      scan_id: scan.id,
      quality,
      issues: issues.map((i) => ({ slug: i.issue_slug, severity: i.severity })),
      angles_used: anglesUsed,
    });
  } catch (e) {
    console.error("scan-face (groq) error:", (e as Error).message);
    return json({ error: (e as Error).message || "Eroare internă", code: "internal" }, 500);
  }
});
