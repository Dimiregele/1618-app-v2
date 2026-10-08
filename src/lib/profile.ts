// Profilul derivat din chestionar. E singurul loc unde răspunsurile devin decizii:
// nivele (stres, somn, fumat, alcool), blocaje de siguranță și indicii pentru motorul de recomandare.
//
// IMPORTANT: scorurile sunt ORIENTATIVE, nu clinice. Pragurile și ponderile de mai jos sunt alese de noi
// (nu provin dintr-un instrument validat) și trebuie revizuite cu un specialist înainte de a fi prezentate ca
// evaluare medicală. De aceea în UI le numim „indicatori orientativi”.

import { QUESTIONS, type Answers } from "./questionnaire";

export type Level = "low" | "moderate" | "high";
export type SleepLevel = "good" | "fair" | "poor";

export type Profile = {
  schema_version: 3;
  age: number | null;
  sex: "female" | "male" | "unspecified" | null;
  phototype: number | null;
  bmi: number | null;
  stress: { score: number; max: number; level: Level; body_signs: string[] } | null;
  sleep: { index: number; level: SleepLevel; hours: string | null } | null;
  smoking: { status: string; pack_years: number | null; products: string[] } | null;
  alcohol: { drinks_per_week: number; level: Level } | null;
  /** Blocaje și indicii pentru recomandări (chei stabile, citite de motorul de recomandare). */
  flags: string[];
  priorities: string[];
  budget: string | null;
  routine_time: string | null;
};

const str = (a: Answers, id: string) => (typeof a[id] === "string" ? (a[id] as string) : null);
const num = (a: Answers, id: string) => (typeof a[id] === "number" ? (a[id] as number) : null);
const list = (a: Answers, id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : []);

function optionScore(a: Answers, questionId: string): number | null {
  const q = QUESTIONS.find((x) => x.id === questionId);
  const v = str(a, questionId);
  if (!q || v === null) return null;
  const s = q.options?.find((o) => o.value === v)?.score;
  return typeof s === "number" ? s : null;
}

function stress(a: Answers): Profile["stress"] {
  const ids = ["stress_overwhelmed", "stress_tension", "stress_control"];
  let score = 0;
  for (const id of ids) {
    const s = optionScore(a, id);
    if (s === null) return null;
    const q = QUESTIONS.find((x) => x.id === id)!;
    score += q.reverse ? 4 - s : s;
  }
  // 0–12: 0–4 scăzut, 5–8 moderat, 9–12 ridicat (praguri orientative)
  const level: Level = score <= 4 ? "low" : score <= 8 ? "moderate" : "high";
  return { score, max: 12, level, body_signs: list(a, "stress_body").filter((v) => v !== "none") };
}

function sleep(a: Answers): Profile["sleep"] {
  const parts = ["sleep_hours", "sleep_latency", "sleep_awakenings", "caffeine_last"].map((id) => optionScore(a, id));
  if (parts.some((p) => p === null)) return null;
  // Maxim: 30 (ore) + 20 (adormire) + 20 (treziri) + 30 (cafeină) = 100
  const index = Math.round((parts as number[]).reduce((s, p) => s + p, 0));
  const level: SleepLevel = index >= 75 ? "good" : index >= 50 ? "fair" : "poor";
  return { index, level, hours: str(a, "sleep_hours") };
}

function smoking(a: Answers): Profile["smoking"] {
  const status = str(a, "smoking_status");
  if (!status) return null;
  const products = list(a, "smoke_products");
  let packYears: number | null = null;
  if (status === "daily" || status === "occasional") {
    const perDay = optionScore(a, "smoke_amount"); // țigări/zi (mijlocul intervalului)
    const years = optionScore(a, "smoke_years"); // ani (mijlocul intervalului)
    if (perDay !== null && years !== null) {
      const effectivePerDay = status === "occasional" ? perDay / 3 : perDay; // ocazional: aprox. o treime
      packYears = Math.round(((effectivePerDay / 20) * years) * 10) / 10;
    }
  }
  return { status, pack_years: packYears, products };
}

function alcohol(a: Answers): Profile["alcohol"] {
  const drinks = optionScore(a, "alcohol");
  if (drinks === null) return null;
  const level: Level = drinks <= 3 ? "low" : drinks <= 7 ? "moderate" : "high";
  return { drinks_per_week: drinks, level };
}

export function deriveProfile(answers: Answers): Profile {
  const a = answers;
  const age = num(a, "age");
  const sexRaw = str(a, "sex");
  const sex = sexRaw === "female" || sexRaw === "male" || sexRaw === "unspecified" ? sexRaw : null;
  const h = num(a, "height_cm");
  const w = num(a, "weight_kg");
  const bmi = h && w ? Math.round((w / ((h / 100) * (h / 100))) * 10) / 10 : null;
  const phototypeRaw = str(a, "phototype");

  const s = stress(a);
  const sl = sleep(a);
  const sm = smoking(a);
  const al = alcohol(a);

  const meds = list(a, "meds");
  const conditions = list(a, "skin_conditions").filter((c) => c !== "none");
  const allergies = list(a, "allergies").filter((c) => c !== "none");
  const flags = new Set<string>();

  // ── Siguranță ──
  const pregnant = str(a, "pregnancy") === "yes";
  const underAge = age !== null && age < 18;
  if (underAge) flags.add("under_18");
  if (pregnant || meds.includes("isotretinoin") || underAge) flags.add("retinoid_block");
  if (pregnant || underAge) flags.add("minoxidil_block");
  if (meds.includes("isotretinoin")) flags.add("no_exfoliating_acids");
  if (meds.includes("antibiotic") || meds.includes("isotretinoin")) flags.add("photosensitivity");
  if (meds.includes("anticoag") || meds.includes("steroid")) flags.add("medication_check");

  // ── Trimiteri către medic ──
  if (str(a, "breakouts") === "cystic" || str(a, "pih") === "scars" || conditions.length > 0) {
    flags.add("doctor_referral_skin");
  }
  if (str(a, "hair_trigger") === "yes" || (str(a, "hair_loss_duration") === "lt3m" && list(a, "hair_concerns").includes("shedding"))) {
    flags.add("doctor_referral_hair");
  }

  // ── Ingrediente de evitat ──
  for (const item of allergies) flags.add(`avoid:${item}`);

  // ── Piele ──
  if (str(a, "skin_sensitivity") === "high" || conditions.includes("eczema") || conditions.includes("rosacea")) {
    flags.add("reactive_skin");
  }
  const phototype = phototypeRaw ? Number(phototypeRaw) : null;
  if (
    (phototype !== null && phototype <= 3) ||
    flags.has("photosensitivity") ||
    str(a, "pih") === "brown" ||
    ["rare", "never"].includes(str(a, "spf_use") ?? "")
  ) {
    flags.add("spf_priority");
  }
  if (str(a, "pih") === "brown" && phototype !== null && phototype >= 4) flags.add("pigmentation_care");
  if (str(a, "skin_type") === "oily" || str(a, "skin_type") === "combination") flags.add("sebum_control");
  if (list(a, "breakout_zones").includes("jawline") && sex !== "male") flags.add("hormonal_acne_pattern");

  // ── Modificatori de stil de viață (pentru explicații în rezultate) ──
  if (s?.level === "high") flags.add("high_stress");
  if (s && s.body_signs.includes("picking")) flags.add("skin_picking");
  if (sl && (sl.level === "poor" || str(a, "sleep_hours") === "lt5" || str(a, "sleep_hours") === "5_6")) flags.add("poor_sleep");
  if (sm && (sm.status === "daily" || sm.status === "occasional")) flags.add("smoker");
  if (al?.level === "high") flags.add("high_alcohol");
  if (str(a, "sugar_freq") === "daily") flags.add("high_sugar");
  if (list(a, "supplements").includes("whey") && list(a, "skin_priority").includes("acne")) flags.add("whey_acne_check");

  return {
    schema_version: 3,
    age,
    sex,
    phototype,
    bmi,
    stress: s,
    sleep: sl,
    smoking: sm,
    alcohol: al,
    flags: [...flags].sort(),
    priorities: list(a, "skin_priority"),
    budget: str(a, "budget"),
    routine_time: str(a, "routine_time"),
  };
}

// ───────────── Explicații afișate în rezultate ─────────────

export type Insight = { id: string; title: string; detail: string; tone: "info" | "watch" };

/** Ce din stilul de viață poate influența rezultatele, în limbaj simplu și prudent (fără diagnostice). */
export function lifestyleInsights(p: Profile): Insight[] {
  const out: Insight[] = [];
  const f = new Set(p.flags);

  if (p.sleep && (f.has("poor_sleep") || p.sleep.level !== "good")) {
    out.push({
      id: "sleep",
      title: `Somn: ${p.sleep.index}/100 (${p.sleep.level === "poor" ? "slab" : p.sleep.level === "fair" ? "mediu" : "bun"})`,
      detail:
        "Somnul scurt sau fragmentat poate accentua cearcănele, inflamația pielii și poate încetini recuperarea. Îmbunătățirea lui contează cât un produs bun.",
      tone: p.sleep.level === "poor" ? "watch" : "info",
    });
  }
  if (p.stress && p.stress.level !== "low") {
    out.push({
      id: "stress",
      title: `Stres: ${p.stress.level === "high" ? "ridicat" : "moderat"} (${p.stress.score}/${p.stress.max})`,
      detail:
        "Stresul susținut poate crește producția de sebum și poate agrava coșurile sau căderea părului. Dacă te simți copleșit constant, merită să vorbești cu un specialist.",
      tone: p.stress.level === "high" ? "watch" : "info",
    });
  }
  if (f.has("skin_picking")) {
    out.push({
      id: "picking",
      title: "Ciupitul pielii",
      detail: "Atingerea sau ciupitul coșurilor lasă pete și cicatrici. Adăugăm în rutină produse calmante și patch-uri pentru coșuri.",
      tone: "watch",
    });
  }
  if (f.has("smoker")) {
    out.push({
      id: "smoking",
      title: "Fumat",
      detail:
        "Nicotina îngustează vasele de sânge din piele, ceea ce poate duce la ten tern și riduri mai devreme. Antioxidanții și SPF-ul ajută, dar renunțarea face cea mai mare diferență.",
      tone: "watch",
    });
  }
  if (f.has("high_alcohol")) {
    out.push({
      id: "alcohol",
      title: "Alcool",
      detail: "Consumul ridicat deshidratează pielea și poate accentua roșeața și cearcănele.",
      tone: "info",
    });
  }
  if (f.has("high_sugar") || f.has("whey_acne_check")) {
    out.push({
      id: "diet",
      title: "Alimentație",
      detail:
        "La unele persoane, zahărul în exces și proteina din zer se asociază cu mai multă acnee. Merită testat reducerea lor 6–8 săptămâni.",
      tone: "info",
    });
  }
  if (f.has("doctor_referral_skin")) {
    out.push({
      id: "doctor_skin",
      title: "Recomandăm și un consult dermatologic",
      detail: "Din răspunsurile tale, produsele cosmetice nu sunt suficiente pentru toate problemele. Un medic poate prescrie tratamentul potrivit.",
      tone: "watch",
    });
  }
  if (f.has("doctor_referral_hair")) {
    out.push({
      id: "doctor_hair",
      title: "Căderea de păr merită verificată",
      detail: "Căderea recentă sau declanșată de un eveniment poate fi temporară și are cauze care se văd din analize. Un consult te ajută să alegi corect.",
      tone: "watch",
    });
  }
  return out;
}
