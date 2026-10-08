// Chestionarul din onboarding (v3).
//
// Principii:
//  - Fiecare întrebare există pentru că schimbă o decizie concretă (produs, siguranță, plan). `why` spune care.
//  - Unde se poate, măsurăm: scale cu scor, intervale numerice, cantități. Din ele iese `deriveProfile()`
//    (vezi profile.ts): nivel de stres, indice de somn, fumat în pachete-an, alcool, blocaje de siguranță.
//  - Secțiunile de plan (alimentație, antrenament) apar doar dacă utilizatorul le vrea.
//
// Răspunsurile se salvează ca { schema_version: 3, ...răspunsuri, derived: Profile }.

export type SectionId =
  | "about"
  | "skin"
  | "safety"
  | "hair"
  | "eyes"
  | "stress"
  | "sleep"
  | "habits"
  | "plans"
  | "body"
  | "fitness"
  | "nutrition"
  | "prefs";

export type Option = {
  value: string;
  label: string;
  hint?: string;
  /** La alegere multiplă: bifarea ei o debifează pe celelalte (ex. „Niciuna”). */
  exclusive?: boolean;
  /** Punctaj folosit la calculul profilului (stres, somn etc.). */
  score?: number;
};

export type NumberSpec = {
  min: number;
  max: number;
  unit: string;
  placeholder?: string;
};

export type AnswerValue = string | string[] | number;
export type Answers = Record<string, AnswerValue>;

export type Question = {
  id: string;
  section: SectionId;
  title: string;
  /** Explicația scurtă afișată sub întrebare: ce decide răspunsul. */
  why: string;
  type: "single" | "multi" | "number";
  options?: Option[];
  /** La `multi`: număr maxim de alegeri (ex. „cele mai importante 2”). */
  maxSelect?: number;
  number?: NumberSpec;
  /** La scale: punctajul se inversează (ex. „simt că am control”). */
  reverse?: boolean;
  /** Întrebarea apare doar dacă funcția întoarce true. */
  showIf?: (answers: Answers) => boolean;
  /** Text rostit, dacă diferă de titlu. */
  spoken?: string;
};

export const SECTION: Record<SectionId, { label: string; intro: string }> = {
  about: {
    label: "Despre tine",
    intro: "Începem cu două date de bază, ca să alegem produse sigure pentru tine.",
  },
  skin: {
    label: "Piele",
    intro: "Începem cu pielea. Răspunde cum e de obicei, nu în cea mai bună sau cea mai rea zi.",
  },
  safety: {
    label: "Sănătate și siguranță",
    intro: "Acum câteva întrebări de siguranță. Contează mult: unele tratamente nu se combină cu anumite produse.",
  },
  hair: { label: "Păr", intro: "Să trecem la păr și scalp." },
  eyes: { label: "Ochi", intro: "Încă puțin despre zona ochilor." },
  stress: {
    label: "Stres",
    intro: "Urmează patru întrebări despre stres. Gândește-te la ultima lună.",
  },
  sleep: { label: "Somn", intro: "Acum somnul. Răspunde cum dormi de obicei." },
  habits: {
    label: "Fumat și alcool",
    intro: "Fumat și alcool. Nu te judecăm; ne ajută să îți dăm un plan realist.",
  },
  plans: { label: "Planuri", intro: "Pe lângă produse, ce planuri vrei să primești?" },
  body: { label: "Corp", intro: "Pentru planuri avem nevoie de câteva măsurători." },
  fitness: { label: "Antrenament", intro: "Acum antrenamentul." },
  nutrition: { label: "Alimentație", intro: "Și la final, alimentația." },
  prefs: { label: "Preferințe", intro: "Ultimele două întrebări, despre cum vrei să arate rutina." },
};

function has(a: Answers, id: string, value: string) {
  const v = a[id];
  return Array.isArray(v) ? v.includes(value) : v === value;
}
function hasAny(a: Answers, id: string, values: string[]) {
  return values.some((v) => has(a, id, v));
}
function pick(a: Answers, id: string) {
  const v = a[id];
  return typeof v === "string" ? v : undefined;
}

// Scala de frecvență folosită la întrebările despre stres.
const FREQ: Option[] = [
  { value: "0", label: "Niciodată", score: 0 },
  { value: "1", label: "Rar", score: 1 },
  { value: "2", label: "Uneori", score: 2 },
  { value: "3", label: "Des", score: 3 },
  { value: "4", label: "Aproape mereu", score: 4 },
];

const wantsLossHair = (a: Answers) => hasAny(a, "hair_concerns", ["thinning", "recession", "shedding"]);
const wantsPlans = (a: Answers) => pick(a, "want_nutrition") === "yes" || (pick(a, "fitness_goal") ?? "none") !== "none";
const wantsTraining = (a: Answers) => !!pick(a, "fitness_goal") && pick(a, "fitness_goal") !== "none";
const smokesNow = (a: Answers) => hasAny(a, "smoking_status", ["daily", "occasional"]);

export const QUESTIONS: Question[] = [
  // ───────────── DESPRE TINE (necesare pentru siguranță și calcule) ─────────────
  {
    id: "age",
    section: "about",
    title: "Câți ani ai?",
    why: "Vârsta decide ce active sunt potrivite (de exemplu retinolul) și cum calculăm necesarul de calorii.",
    type: "number",
    number: { min: 16, max: 90, unit: "ani", placeholder: "ex: 28" },
  },
  {
    id: "sex",
    section: "about",
    title: "Ce sex ai la naștere?",
    why: "Hormonii influențează acneea, căderea părului și caloriile. Folosim răspunsul doar pentru recomandări.",
    type: "single",
    options: [
      { value: "female", label: "Feminin" },
      { value: "male", label: "Masculin" },
      { value: "unspecified", label: "Prefer să nu spun" },
    ],
  },
  {
    id: "phototype",
    section: "skin",
    title: "Ce se întâmplă cu pielea ta dacă stai 30 de minute la soare, prima dată în vară, fără protecție?",
    why: "Fototipul decide factorul SPF și ce tratamente pentru pete sunt sigure pentru tine.",
    type: "single",
    options: [
      { value: "1", label: "Se înroșește mereu, nu se bronzează", hint: "Piele foarte deschisă, adesea cu pistrui" },
      { value: "2", label: "Se înroșește ușor, se bronzează puțin" },
      { value: "3", label: "Uneori se înroșește, apoi se bronzează" },
      { value: "4", label: "Rar se înroșește, se bronzează ușor" },
      { value: "5", label: "Aproape niciodată nu se înroșește, bronz închis" },
      { value: "6", label: "Nu se arde niciodată, pigmentare foarte închisă" },
    ],
  },

  // ───────────── SĂNĂTATE ȘI SIGURANȚĂ ─────────────
  {
    id: "pregnancy",
    section: "safety",
    title: "Ești însărcinată, alăptezi sau încerci să rămâi însărcinată?",
    why: "Retinoizii și alte ingrediente nu se folosesc în aceste perioade. Răspunsul rămâne privat.",
    type: "single",
    showIf: (a) => pick(a, "sex") !== "male",
    options: [
      { value: "no", label: "Nu" },
      { value: "yes", label: "Da, oricare dintre acestea" },
      { value: "skip", label: "Prefer să nu răspund" },
    ],
  },
  {
    id: "meds",
    section: "safety",
    title: "Iei sau ai luat recent vreunul dintre aceste tratamente?",
    why: "Unele fac pielea sensibilă la soare, iar altele nu se combină cu retinoizi sau acizi. Nu înlocuiește medicul.",
    type: "multi",
    options: [
      { value: "none", label: "Niciunul", exclusive: true },
      { value: "isotretinoin", label: "Isotretinoin (Roaccutane) în ultimele 6 luni" },
      { value: "antibiotic", label: "Antibiotic oral pentru acnee sau rozacee", hint: "Doxiciclină, minociclină" },
      { value: "hormonal", label: "Contraceptive sau alt tratament hormonal" },
      { value: "hair_drug", label: "Finasterid, dutasterid sau minoxidil" },
      { value: "steroid", label: "Corticosteroizi (orali sau creme pe față)" },
      { value: "anticoag", label: "Anticoagulante" },
    ],
  },
  {
    id: "skin_conditions",
    section: "safety",
    title: "Ai primit vreodată de la un medic unul dintre aceste diagnostice?",
    why: "Aceste afecțiuni schimbă complet ce produse sunt sigure. Pentru ele recomandăm și consult de specialitate.",
    type: "multi",
    options: [
      { value: "none", label: "Niciunul", exclusive: true },
      { value: "eczema", label: "Eczemă sau dermatită atopică" },
      { value: "rosacea", label: "Rozacee" },
      { value: "seb_derm", label: "Dermatită seboreică" },
      { value: "psoriasis", label: "Psoriazis" },
      { value: "vitiligo", label: "Vitiligo" },
    ],
  },
  {
    id: "allergies",
    section: "safety",
    title: "Ai reacții sau alergii cunoscute la ingrediente cosmetice?",
    why: "Excludem automat produsele care le conțin, chiar dacă altfel ar fi potrivite.",
    type: "multi",
    options: [
      { value: "none", label: "Niciuna cunoscută", exclusive: true },
      { value: "fragrance", label: "Parfum sau arome" },
      { value: "alcohol", label: "Alcool denaturat" },
      { value: "sulfates", label: "Sulfați" },
      { value: "lanolin", label: "Lanolină" },
      { value: "retinoids", label: "Retinoizi (retinol, adapalen)" },
      { value: "acids", label: "Acizi exfolianți (AHA / BHA)" },
    ],
  },

  // ───────────── PIELE ─────────────
  {
    id: "skin_type",
    section: "skin",
    title: "Cum se simte pielea ta la 3 ore după ce o speli, fără să pui nimic pe ea?",
    why: "Tipul de piele decide curățarea, hidratantul și serul pe care le primești.",
    type: "single",
    options: [
      { value: "dry", label: "Încordată, uscată", hint: "Simți nevoia să pui crema imediat" },
      { value: "normal", label: "Confortabilă", hint: "Nici uscată, nici lucioasă" },
      { value: "combination", label: "Lucioasă doar pe frunte și nas" },
      { value: "oily", label: "Lucioasă pe toată fața" },
      { value: "unsure", label: "Nu sunt sigur(ă)" },
    ],
  },
  {
    id: "skin_sensitivity",
    section: "skin",
    title: "Cum reacționează pielea ta la produse noi?",
    why: "La piele reactivă începem cu concentrații mici și evităm activele agresive.",
    type: "single",
    options: [
      { value: "none", label: "De obicei deloc" },
      { value: "mild", label: "Uneori roșeață sau senzație de arsură ușoară" },
      { value: "high", label: "Des: înțepături, mâncărime, descuamare" },
    ],
  },
  {
    id: "breakouts",
    section: "skin",
    title: "Cât de des îți apar coșuri noi?",
    why: "Frecvența și tipul coșurilor decid dacă ajung produsele cosmetice sau e nevoie de un medic.",
    type: "single",
    options: [
      { value: "rare", label: "Aproape niciodată" },
      { value: "monthly", label: "Câteva pe lună", hint: "Mai ales înaintea ciclului sau în perioade de stres" },
      { value: "constant", label: "Constant, în mai multe zone" },
      { value: "cystic", label: "Noduli dureroși, adânci", hint: "Îți vom recomanda și un consult dermatologic" },
    ],
  },
  {
    id: "breakout_zones",
    section: "skin",
    title: "Unde apar cel mai des?",
    why: "Zona sugerează cauza probabilă (sebum, hormoni, fricțiune) și tratamentul potrivit.",
    type: "multi",
    showIf: (a) => !!pick(a, "breakouts") && pick(a, "breakouts") !== "rare",
    options: [
      { value: "t_zone", label: "Frunte și nas" },
      { value: "cheeks", label: "Obraji" },
      { value: "jawline", label: "Linia maxilarului și bărbie", hint: "Des legat de hormoni" },
      { value: "body", label: "Spate sau piept" },
    ],
  },
  {
    id: "pih",
    section: "skin",
    title: "După ce dispare un coș sau o iritație, ce rămâne pe piele?",
    why: "Petele maronii cer alt tratament (SPF strict, niacinamidă, acid azelaic) decât coșurile active.",
    type: "single",
    showIf: (a) => !!pick(a, "breakouts") && pick(a, "breakouts") !== "rare",
    options: [
      { value: "nothing", label: "Nimic, se vindecă curat" },
      { value: "pink", label: "O pată roz-roșie care trece în câteva săptămâni" },
      { value: "brown", label: "O pată maronie care ține luni de zile" },
      { value: "scars", label: "Cicatrici în relief sau adânci", hint: "Cosmeticele nu le tratează; recomandăm consult" },
    ],
  },
  {
    id: "routine_now",
    section: "skin",
    title: "Ce folosești acum, în mod regulat, pentru față?",
    why: "Nu îți dăm din nou ce ai deja și nu amestecăm activele care se anulează sau irită.",
    type: "multi",
    options: [
      { value: "nothing", label: "Nimic, doar apă", exclusive: true },
      { value: "cleanser", label: "Produs de curățare" },
      { value: "moisturizer", label: "Cremă hidratantă" },
      { value: "spf", label: "Cremă cu SPF, zilnic" },
      { value: "retinoid", label: "Retinol sau retinoid" },
      { value: "acids", label: "Acizi exfolianți (AHA / BHA)" },
      { value: "vitc", label: "Vitamina C sau niacinamidă" },
      { value: "prescribed", label: "Tratament prescris de medic" },
    ],
  },
  {
    id: "spf_use",
    section: "skin",
    title: "Cât de des folosești cremă cu SPF?",
    why: "SPF-ul face cea mai mare diferență pentru riduri și pete; ajustăm rutina în funcție de cât îl folosești deja.",
    type: "single",
    options: [
      { value: "daily", label: "În fiecare zi" },
      { value: "sunny", label: "Doar când e soare sau la plajă" },
      { value: "rare", label: "Rar" },
      { value: "never", label: "Niciodată" },
    ],
  },
  {
    id: "skin_priority",
    section: "skin",
    title: "Care sunt cele mai importante 2 lucruri pe care vrei să le îmbunătățești la piele?",
    why: "Punem pe primul loc ce contează pentru tine, nu doar ce vede scanarea.",
    type: "multi",
    maxSelect: 2,
    options: [
      { value: "acne", label: "Acnee și coșuri" },
      { value: "spots", label: "Pete și ton inegal" },
      { value: "wrinkles", label: "Riduri și linii fine" },
      { value: "pores", label: "Pori vizibili" },
      { value: "redness", label: "Roșeață și iritații" },
      { value: "oil", label: "Luciu, ten gras" },
      { value: "dull", label: "Uscăciune sau aspect tern" },
    ],
  },

  // ───────────── PĂR ─────────────
  {
    id: "hair_concerns",
    section: "hair",
    title: "Ce observi la păr sau la scalp?",
    why: "Se combină cu ce vede scanarea ca să alegem tratamentul corect pentru scalp.",
    type: "multi",
    options: [
      { value: "none", label: "Nimic deranjant", exclusive: true },
      { value: "thinning", label: "Păr mai rar în creștet" },
      { value: "recession", label: "Linia frontală se retrage" },
      { value: "shedding", label: "Cad mai multe fire decât înainte" },
      { value: "dandruff", label: "Mătreață" },
      { value: "oily_scalp", label: "Scalp gras, păr lipit repede" },
      { value: "dry_scalp", label: "Scalp uscat sau iritat" },
    ],
  },
  {
    id: "hair_loss_duration",
    section: "hair",
    title: "De cât timp observi schimbarea?",
    why: "Căderea recentă și bruscă are alte cauze decât subțierea lentă și alt pas următor.",
    type: "single",
    showIf: wantsLossHair,
    options: [
      { value: "lt3m", label: "Sub 3 luni", hint: "Recent, apărut destul de brusc" },
      { value: "3to12m", label: "3–12 luni" },
      { value: "gt1y", label: "Peste un an", hint: "Progres lent, constant" },
    ],
  },
  {
    id: "hair_trigger",
    section: "hair",
    title: "Cu 2–4 luni înainte să înceapă, a fost un eveniment important?",
    why: "Boala cu febră, nașterea, o dietă drastică sau un șoc pot da cădere temporară, care se tratează diferit de cea ereditară.",
    type: "single",
    showIf: (a) => wantsLossHair(a) && pick(a, "hair_loss_duration") !== "gt1y",
    options: [
      { value: "yes", label: "Da (boală, naștere, dietă drastică, șoc)" },
      { value: "no", label: "Nu, nimic deosebit" },
      { value: "unsure", label: "Nu știu" },
    ],
  },
  {
    id: "hair_family",
    section: "hair",
    title: "Au avut rude apropiate subțiere sau chelie?",
    why: "Predispoziția în familie e cel mai bun indicator pentru căderea ereditară.",
    type: "single",
    showIf: wantsLossHair,
    options: [
      { value: "yes", label: "Da, la părinți sau frați" },
      { value: "no", label: "Nu" },
      { value: "unknown", label: "Nu știu" },
    ],
  },
  {
    id: "hair_tried",
    section: "hair",
    title: "Ai încercat deja ceva împotriva căderii?",
    why: "Nu repetăm ce ai încercat și vedem dacă ai dat tratamentului destul timp (minim 4–6 luni).",
    type: "multi",
    showIf: wantsLossHair,
    options: [
      { value: "nothing", label: "Nimic încă", exclusive: true },
      { value: "minoxidil", label: "Minoxidil" },
      { value: "finasteride", label: "Finasterid sau dutasterid" },
      { value: "shampoo", label: "Șampon anti-cădere" },
      { value: "supplements", label: "Suplimente (biotină, zinc, fier)" },
    ],
  },

  // ───────────── OCHI ─────────────
  {
    id: "eye_concerns",
    section: "eyes",
    title: "Ce te deranjează în zona ochilor și a sprâncenelor?",
    why: "Decide dacă recomandăm îngrijire pentru ochi sau produse opționale pentru gene și sprâncene.",
    type: "multi",
    options: [
      { value: "none", label: "Nimic", exclusive: true },
      { value: "dark_circles", label: "Cearcăne" },
      { value: "puffiness", label: "Pungi sau umflături dimineața" },
      { value: "sparse_brows", label: "Sprâncene rare" },
      { value: "sparse_lashes", label: "Gene scurte sau rare" },
    ],
  },
  {
    id: "dark_circle_pattern",
    section: "eyes",
    title: "Când se văd cel mai tare cearcănele?",
    why: "Au cauze diferite (somn, pigmentare, alergii, umflături) și fiecare se tratează altfel.",
    type: "single",
    showIf: (a) => has(a, "eye_concerns", "dark_circles"),
    options: [
      { value: "tired", label: "După nopți scurte sau când sunt obosit(ă)" },
      { value: "always", label: "Mereu la fel, și când m-am odihnit", hint: "Des ereditar sau pigmentar" },
      { value: "allergy", label: "În sezonul alergiilor sau cu nasul înfundat" },
      { value: "puffy", label: "Dimineața, împreună cu umflătură" },
    ],
  },

  // ───────────── STRES (4 întrebări, scor 0–12) ─────────────
  {
    id: "stress_overwhelmed",
    section: "stress",
    title: "În ultima lună, cât de des ai simțit că nu mai faci față la tot ce ai de făcut?",
    why: "Împreună cu următoarele trei calculăm un nivel orientativ de stres, care influențează sebumul, coșurile și căderea părului.",
    type: "single",
    options: FREQ,
  },
  {
    id: "stress_tension",
    section: "stress",
    title: "În ultima lună, cât de des ai fost tensionat(ă) sau iritabil(ă) fără un motiv clar?",
    why: "A doua parte din scorul de stres.",
    type: "single",
    options: FREQ,
  },
  {
    id: "stress_control",
    section: "stress",
    title: "În ultima lună, cât de des ai simțit că ai control asupra lucrurilor importante din viața ta?",
    why: "A treia parte din scorul de stres (la această întrebare, un răspuns „des” înseamnă mai puțin stres).",
    type: "single",
    reverse: true,
    options: FREQ,
  },
  {
    id: "stress_body",
    section: "stress",
    title: "Ai observat oricare dintre aceste semne când ești stresat(ă)?",
    why: "Ciupitul pielii și căderea părului legate de stres se tratează diferit de problemele cosmetice.",
    type: "multi",
    options: [
      { value: "none", label: "Niciunul", exclusive: true },
      { value: "jaw", label: "Încleștez maxilarul sau scrâșnesc din dinți" },
      { value: "picking", label: "Ciupesc sau scobesc pielea, coșurile sau scalpul" },
      { value: "hair_pull", label: "Trag sau răsucesc părul" },
      { value: "breakouts", label: "Îmi apar mai multe coșuri sau erupții" },
      { value: "headache", label: "Dureri de cap sau tensiune în gât și umeri" },
    ],
  },

  // ───────────── SOMN ─────────────
  {
    id: "sleep_hours",
    section: "sleep",
    title: "Câte ore dormi, de obicei, într-o noapte?",
    why: "Somnul influențează direct cearcănele, inflamația pielii și recuperarea după antrenament.",
    type: "single",
    options: [
      { value: "lt5", label: "Sub 5 ore", score: 0 },
      { value: "5_6", label: "5–6 ore", score: 10 },
      { value: "6_7", label: "6–7 ore", score: 22 },
      { value: "7_8", label: "7–8 ore", score: 30 },
      { value: "8_9", label: "8–9 ore", score: 30 },
      { value: "gt9", label: "Peste 9 ore", score: 24 },
    ],
  },
  {
    id: "sleep_latency",
    section: "sleep",
    title: "În cât timp adormi, de obicei, după ce stingi lumina?",
    why: "Adormirea lentă și somnul fragmentat afectează pielea altfel decât somnul doar scurt.",
    type: "single",
    options: [
      { value: "lt15", label: "Sub 15 minute", score: 20 },
      { value: "15_30", label: "15–30 de minute", score: 14 },
      { value: "30_60", label: "30–60 de minute", score: 7 },
      { value: "gt60", label: "Peste o oră", score: 0 },
    ],
  },
  {
    id: "sleep_awakenings",
    section: "sleep",
    title: "De câte ori te trezești, de obicei, în timpul nopții?",
    why: "Treziri dese înseamnă somn de calitate scăzută, chiar dacă numeri 8 ore.",
    type: "single",
    options: [
      { value: "0", label: "Aproape niciodată", score: 20 },
      { value: "1", label: "O dată", score: 14 },
      { value: "2plus", label: "De 2 sau mai multe ori", score: 6 },
      { value: "stuck", label: "Mă trezesc și nu mai adorm", score: 0 },
    ],
  },
  {
    id: "caffeine_last",
    section: "sleep",
    title: "Când bei ultima cafea, ceai verde sau energizant din zi?",
    why: "Cafeaua băută după-amiaza scade calitatea somnului chiar dacă adormi ușor.",
    type: "single",
    options: [
      { value: "none", label: "Nu beau deloc", score: 30 },
      { value: "before12", label: "Înainte de ora 12", score: 30 },
      { value: "12_15", label: "Între 12 și 15", score: 20 },
      { value: "15_18", label: "Între 15 și 18", score: 8 },
      { value: "after18", label: "După ora 18", score: 0 },
    ],
  },

  // ───────────── FUMAT ȘI ALCOOL ─────────────
  {
    id: "smoking_status",
    section: "habits",
    title: "Fumezi sau folosești produse cu nicotină?",
    why: "Fumatul reduce irigarea pielii și accelerează riduri și tonul tern; poate încetini și răspunsul la tratamente.",
    type: "single",
    options: [
      { value: "never", label: "Nu, niciodată" },
      { value: "former", label: "Nu, dar am fumat înainte" },
      { value: "occasional", label: "Ocazional, nu în fiecare zi" },
      { value: "daily", label: "Da, în fiecare zi" },
    ],
  },
  {
    id: "smoke_products",
    section: "habits",
    title: "Ce folosești?",
    why: "Țigările, vape-ul și tutunul încălzit nu au același impact, iar noi le tratăm separat.",
    type: "multi",
    showIf: (a) => !!pick(a, "smoking_status") && pick(a, "smoking_status") !== "never",
    options: [
      { value: "cigarettes", label: "Țigări" },
      { value: "vape", label: "Vape sau țigară electronică" },
      { value: "heated", label: "Tutun încălzit (IQOS și similare)" },
      { value: "hookah", label: "Narghilea sau trabucuri" },
    ],
  },
  {
    id: "smoke_amount",
    section: "habits",
    title: "Câte țigări (sau echivalent) fumezi într-o zi în care fumezi?",
    why: "Cantitatea și durata ne dau un indicator de expunere (pachete-an).",
    type: "single",
    showIf: smokesNow,
    options: [
      { value: "1_5", label: "1–5", score: 3 },
      { value: "6_10", label: "6–10", score: 8 },
      { value: "11_20", label: "11–20 (până la un pachet)", score: 15 },
      { value: "gt20", label: "Peste 20", score: 25 },
    ],
  },
  {
    id: "smoke_years",
    section: "habits",
    title: "De câți ani fumezi?",
    why: "Împreună cu cantitatea, ne dă expunerea totală.",
    type: "single",
    showIf: smokesNow,
    options: [
      { value: "lt1", label: "Sub 1 an", score: 0.5 },
      { value: "1_5", label: "1–5 ani", score: 3 },
      { value: "5_10", label: "5–10 ani", score: 7.5 },
      { value: "10_20", label: "10–20 de ani", score: 15 },
      { value: "gt20", label: "Peste 20 de ani", score: 25 },
    ],
  },
  {
    id: "quit_time",
    section: "habits",
    title: "Cu cât timp în urmă ai renunțat?",
    why: "Pielea își revine treptat după renunțare, iar noi ținem cont de asta în așteptările pe care ți le dăm.",
    type: "single",
    showIf: (a) => pick(a, "smoking_status") === "former",
    options: [
      { value: "lt6m", label: "Sub 6 luni" },
      { value: "6_12m", label: "6–12 luni" },
      { value: "1_5y", label: "1–5 ani" },
      { value: "gt5y", label: "Peste 5 ani" },
    ],
  },
  {
    id: "alcohol",
    section: "habits",
    title: "Câte băuturi alcoolice consumi într-o săptămână obișnuită?",
    why: "Alcoolul deshidratează pielea și poate accentua roșeața; contează și pentru planul de alimentație.",
    type: "single",
    options: [
      { value: "0", label: "Deloc", score: 0 },
      { value: "1_3", label: "1–3", hint: "O băutură = 330 ml bere, 150 ml vin sau 40 ml tărie", score: 2 },
      { value: "4_7", label: "4–7", score: 5.5 },
      { value: "8_14", label: "8–14", score: 11 },
      { value: "gt14", label: "Peste 14", score: 18 },
    ],
  },

  // ───────────── PLANURI ─────────────
  {
    id: "want_nutrition",
    section: "plans",
    title: "Vrei și un plan de alimentație adaptat ție?",
    why: "Dacă răspunzi nu, sărim peste întrebările despre alimentație.",
    type: "single",
    options: [
      { value: "yes", label: "Da" },
      { value: "no", label: "Nu, doar produse" },
    ],
  },
  {
    id: "fitness_goal",
    section: "plans",
    title: "Care este obiectivul tău fizic principal?",
    why: "Obiectivul decide structura planului de antrenament și caloriile din planul de alimentație.",
    type: "single",
    options: [
      { value: "lose_fat", label: "Slăbesc" },
      { value: "build_muscle", label: "Câștig masă musculară" },
      { value: "recomp", label: "Mă definesc", hint: "Pierd grăsime și păstrez sau câștig mușchi" },
      { value: "general", label: "Energie și sănătate generală" },
      { value: "none", label: "Nu vreau plan de antrenament" },
    ],
  },

  // ───────────── CORP (doar dacă vrea planuri) ─────────────
  {
    id: "height_cm",
    section: "body",
    title: "Cât măsori în înălțime?",
    why: "Împreună cu greutatea, vârsta și sexul calculăm necesarul de calorii.",
    type: "number",
    showIf: wantsPlans,
    number: { min: 130, max: 230, unit: "cm", placeholder: "ex: 175" },
  },
  {
    id: "weight_kg",
    section: "body",
    title: "Cât cântărești acum?",
    why: "Punctul de plecare pentru planul de alimentație și pentru ritmul sănătos de schimbare.",
    type: "number",
    showIf: wantsPlans,
    number: { min: 35, max: 250, unit: "kg", placeholder: "ex: 70" },
  },
  {
    id: "job_activity",
    section: "body",
    title: "Cum arată o zi obișnuită de lucru, ca mișcare?",
    why: "Mișcarea de peste zi schimbă necesarul de calorii mai mult decât un antrenament.",
    type: "single",
    showIf: wantsPlans,
    options: [
      { value: "sitting", label: "Stau aproape tot timpul jos" },
      { value: "mixed", label: "Parte stau, parte mă mișc" },
      { value: "standing", label: "Sunt mai mult în picioare" },
      { value: "heavy", label: "Muncă fizică" },
    ],
  },

  // ───────────── ANTRENAMENT ─────────────
  {
    id: "fitness_level",
    section: "fitness",
    title: "Cum te-ai antrenat în ultimele 6 luni?",
    why: "Punctul de start decide intensitatea. Un plan prea greu te face să renunți după două săptămâni.",
    type: "single",
    showIf: wantsTraining,
    options: [
      { value: "none", label: "Deloc" },
      { value: "irregular", label: "Neregulat, cu pauze lungi" },
      { value: "regular", label: "Regulat, de 2–3 ori pe săptămână" },
      { value: "advanced", label: "Regulat și structurat, de peste 2 ani" },
    ],
  },
  {
    id: "training_days",
    section: "fitness",
    title: "Câte zile pe săptămână poți să te antrenezi, realist?",
    why: "Construim planul pe zilele pe care chiar le ai, nu pe cele pe care ți le dorești.",
    type: "single",
    showIf: wantsTraining,
    options: [
      { value: "1_2", label: "1–2 zile" },
      { value: "3", label: "3 zile" },
      { value: "4_5", label: "4–5 zile" },
      { value: "6", label: "6 zile sau mai mult" },
    ],
  },
  {
    id: "equipment",
    section: "fitness",
    title: "Unde și cu ce te antrenezi?",
    why: "Alegem exerciții pe care le poți face cu adevărat, cu echipamentul pe care îl ai.",
    type: "single",
    showIf: wantsTraining,
    options: [
      { value: "gym", label: "Sală completă" },
      { value: "home_weights", label: "Acasă, cu gantere sau benzi" },
      { value: "bodyweight", label: "Doar cu greutatea corpului" },
      { value: "outdoor", label: "În aer liber (alergare, calistenie)" },
    ],
  },
  {
    id: "injuries",
    section: "fitness",
    title: "Ai zone sensibile sau accidentări de care trebuie să ținem cont?",
    why: "Evităm exercițiile care îți agravează problema. Nu înlocuiește părerea unui medic.",
    type: "multi",
    showIf: wantsTraining,
    options: [
      { value: "none", label: "Niciuna", exclusive: true },
      { value: "back", label: "Spate sau coloană" },
      { value: "knees", label: "Genunchi" },
      { value: "shoulders", label: "Umeri" },
      { value: "wrists", label: "Încheieturi" },
    ],
  },

  // ───────────── ALIMENTAȚIE ─────────────
  {
    id: "diet_restrictions",
    section: "nutrition",
    title: "Ai restricții sau alergii alimentare?",
    why: "Mesele din plan le exclud automat. La alergii severe, urmează întotdeauna indicațiile medicului.",
    type: "multi",
    showIf: (a) => pick(a, "want_nutrition") === "yes",
    options: [
      { value: "none", label: "Niciuna", exclusive: true },
      { value: "vegetarian", label: "Vegetarian" },
      { value: "vegan", label: "Vegan" },
      { value: "lactose_free", label: "Fără lactoză" },
      { value: "gluten_free", label: "Fără gluten" },
      { value: "nuts", label: "Alergie la nuci sau alune" },
    ],
  },
  {
    id: "meals_per_day",
    section: "nutrition",
    title: "Câte mese pe zi ți se potrivesc?",
    why: "Împărțim caloriile pe mesele pe care le vei respecta cu adevărat.",
    type: "single",
    showIf: (a) => pick(a, "want_nutrition") === "yes",
    options: [
      { value: "2", label: "2 mese" },
      { value: "3", label: "3 mese" },
      { value: "4plus", label: "4 sau mai multe, cu gustări" },
    ],
  },
  {
    id: "cooking_time",
    section: "nutrition",
    title: "Cât timp ai pentru gătit într-o zi obișnuită?",
    why: "Rețetele din plan se potrivesc cu timpul tău, ca să nu rămână doar pe hârtie.",
    type: "single",
    showIf: (a) => pick(a, "want_nutrition") === "yes",
    options: [
      { value: "lt15", label: "Sub 15 minute" },
      { value: "15_30", label: "15–30 de minute" },
      { value: "gt30", label: "Peste 30 de minute" },
      { value: "eat_out", label: "Mănânc mai mult în oraș sau comand" },
    ],
  },
  {
    id: "sugar_freq",
    section: "nutrition",
    title: "Cât de des mănânci dulciuri, produse de patiserie sau bei băuturi dulci?",
    why: "La unele persoane, zahărul în exces se asociază cu mai multă acnee și cu un aspect tern al pielii.",
    type: "single",
    showIf: (a) => pick(a, "want_nutrition") === "yes",
    options: [
      { value: "daily", label: "În fiecare zi" },
      { value: "often", label: "De câteva ori pe săptămână" },
      { value: "rare", label: "Rar" },
    ],
  },
  {
    id: "supplements",
    section: "nutrition",
    title: "Iei suplimente?",
    why: "Nu le dublăm în plan, iar proteina din zer, de exemplu, poate agrava acneea la unele persoane.",
    type: "multi",
    showIf: (a) => pick(a, "want_nutrition") === "yes",
    options: [
      { value: "none", label: "Niciunul", exclusive: true },
      { value: "whey", label: "Proteină din zer (whey)" },
      { value: "creatine", label: "Creatină" },
      { value: "omega3", label: "Omega-3" },
      { value: "vitd", label: "Vitamina D" },
      { value: "multivit", label: "Multivitamine" },
      { value: "collagen", label: "Colagen" },
    ],
  },

  // ───────────── PREFERINȚE ─────────────
  {
    id: "budget",
    section: "prefs",
    title: "Cât ești dispus(ă) să cheltui pe lună pentru produse?",
    why: "Alegem produse în bugetul tău, în loc să îți arătăm ce nu îți permiți.",
    type: "single",
    options: [
      { value: "lt25", label: "Până în 25 €" },
      { value: "25_50", label: "25–50 €" },
      { value: "50_100", label: "50–100 €" },
      { value: "gt100", label: "Peste 100 €" },
    ],
  },
  {
    id: "routine_time",
    section: "prefs",
    title: "Cât timp ai pe zi pentru îngrijire?",
    why: "O rutină de 3 pași pe care o ții bate o rutină de 8 pași pe care o abandonezi.",
    type: "single",
    options: [
      { value: "2min", label: "Cam 2 minute", hint: "2–3 pași" },
      { value: "5min", label: "Cam 5 minute", hint: "3–4 pași" },
      { value: "10min", label: "10 minute sau mai mult", hint: "5 sau mai mulți pași" },
    ],
  },
];

/** Întrebările efectiv vizibile, în funcție de răspunsurile de până acum. */
export function visibleQuestions(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => !q.showIf || q.showIf(answers));
}

/** Elimină răspunsurile la întrebări care nu mai sunt vizibile (după ce utilizatorul și-a schimbat o alegere). */
export function pruneAnswers(answers: Answers): Answers {
  const visibleIds = new Set(visibleQuestions(answers).map((q) => q.id));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => visibleIds.has(id)));
}

/** A fost întrebarea răspunsă? */
export function isAnswered(q: Question, answers: Answers): boolean {
  const v = answers[q.id];
  if (q.type === "multi") return Array.isArray(v) && v.length > 0;
  if (q.type === "number") return typeof v === "number";
  return typeof v === "string";
}
