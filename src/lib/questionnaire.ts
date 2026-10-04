// Chestionarul din onboarding. Fiecare întrebare:
//  - are un `id` stabil (cheia din `questionnaire_responses.answers`),
//  - spune pe ecran DE CE o punem (`why`) și ce decide răspunsul (`drives`),
//  - are variante de răspuns reale, cu `value` stabil (nu text liber).
//
// Răspunsurile se salvează ca { schema_version: 2, [id]: value | value[] }.
// `drives` e doar documentație pentru motorul de recomandare / generatorul de planuri:
// arată ce parte din rezultat depinde de întrebarea respectivă.

export type QuestionSection = "skin" | "hair" | "eyes" | "lifestyle" | "fitness" | "nutrition";

export type Option = {
  value: string;
  label: string;
  hint?: string;
  /** La alegere multiplă: bifarea ei o debifează pe celelalte (ex. „Niciuna”). */
  exclusive?: boolean;
};

export type Question = {
  id: string;
  section: QuestionSection;
  title: string;
  /** Explicația scurtă afișată sub întrebare: de ce o punem. */
  why: string;
  /** Ce parte din rezultat depinde de răspuns (doar documentație). */
  drives: string[];
  type: "single" | "multi";
  options: Option[];
  /** Întrebarea apare doar dacă funcția întoarce true. */
  showIf?: (answers: Answers) => boolean;
  /** Text rostit de asistentul vocal (dacă diferă de titlu). */
  spoken?: string;
};

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

export const SECTION_LABEL: Record<QuestionSection, string> = {
  skin: "Piele",
  hair: "Păr",
  eyes: "Ochi",
  lifestyle: "Stil de viață",
  fitness: "Antrenament",
  nutrition: "Alimentație",
};

function has(answers: Answers, id: string, value: string) {
  const a = answers[id];
  return Array.isArray(a) ? a.includes(value) : a === value;
}

export const QUESTIONS: Question[] = [
  // ───────────── PIELE ─────────────
  {
    id: "skin_type",
    section: "skin",
    title: "Cum se simte pielea ta la 3 ore după ce o speli, fără să pui nimic pe ea?",
    why: "Tipul de piele decide ce curățare, hidratant și ser primești.",
    drives: ["cleanser", "moisturizer", "serum"],
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
    why: "Dacă ai piele reactivă, începem cu concentrații mici și evităm activele agresive.",
    drives: ["active_strength", "product_selection"],
    type: "single",
    options: [
      { value: "none", label: "De obicei deloc" },
      { value: "mild", label: "Uneori roșeață sau senzație de arsură ușoară" },
      { value: "high", label: "Des: înțepături, mâncărime, descuamare" },
      { value: "allergic", label: "Am avut reacții alergice la cosmetice" },
    ],
  },
  {
    id: "breakouts",
    section: "skin",
    title: "Cât de des îți apar coșuri noi?",
    why: "Frecvența și tipul de coșuri decid dacă ajung produsele cosmetice sau e nevoie de un medic.",
    drives: ["acne_products", "doctor_referral"],
    type: "single",
    options: [
      { value: "rare", label: "Aproape niciodată" },
      { value: "monthly", label: "Câteva pe lună", hint: "Mai ales înaintea ciclului sau în perioade de stres" },
      { value: "constant", label: "Constant, în toate zonele" },
      { value: "cystic", label: "Noduli dureroși, adânci", hint: "Îți vom recomanda și un consult dermatologic" },
    ],
  },
  {
    id: "current_routine",
    section: "skin",
    title: "Ce folosești acum, în mod regulat, pentru față?",
    why: "Nu îți dăm din nou ce ai deja și nu amestecăm activele care se anulează sau irită.",
    drives: ["avoid_duplicates", "ingredient_conflicts"],
    type: "multi",
    options: [
      { value: "nothing", label: "Nimic, doar apă", exclusive: true },
      { value: "cleanser", label: "Produs de curățare" },
      { value: "moisturizer", label: "Cremă hidratantă" },
      { value: "spf", label: "Cremă cu SPF, zilnic" },
      { value: "actives", label: "Seruri active", hint: "Retinol, vitamina C, acizi (AHA/BHA), niacinamidă" },
      { value: "prescribed", label: "Tratament prescris de medic" },
    ],
  },
  {
    id: "sun_exposure",
    section: "skin",
    title: "Cât timp petreci zilnic la soare, fără umbră?",
    why: "Expunerea la soare influențează pigmentarea, îmbătrânirea pielii și factorul SPF potrivit.",
    drives: ["spf_level", "pigmentation"],
    type: "single",
    options: [
      { value: "low", label: "Sub 15 minute", hint: "Lucrez în interior, ies puțin" },
      { value: "medium", label: "15–60 de minute" },
      { value: "high", label: "Peste o oră", hint: "Lucrez afară sau fac sport în aer liber" },
      { value: "tanning", label: "Mă bronzez deliberat sau merg la solar" },
    ],
  },
  {
    id: "ingredient_avoid",
    section: "skin",
    title: "Ai ingrediente pe care știi că trebuie să le eviți?",
    why: "Excludem automat produsele care le conțin, chiar dacă ar fi altfel potrivite.",
    drives: ["product_exclusions"],
    type: "multi",
    options: [
      { value: "none", label: "Niciunul cunoscut", exclusive: true },
      { value: "fragrance", label: "Parfum / arome" },
      { value: "alcohol", label: "Alcool denaturat" },
      { value: "retinoids", label: "Retinoizi (retinol, adapalen)" },
      { value: "acids", label: "Acizi exfolianți (AHA / BHA)" },
      { value: "sulfates", label: "Sulfați" },
    ],
  },
  {
    id: "pregnancy",
    section: "skin",
    title: "Ești însărcinată, alăptezi sau încerci să rămâi însărcinată?",
    why: "Unele ingrediente (de exemplu retinoizii) nu se folosesc în aceste perioade. Răspunsul rămâne privat.",
    drives: ["retinoid_block", "minoxidil_block"],
    type: "single",
    options: [
      { value: "no", label: "Nu" },
      { value: "yes", label: "Da, oricare dintre acestea" },
      { value: "na", label: "Nu se aplică" },
      { value: "skip", label: "Prefer să nu răspund" },
    ],
  },

  // ───────────── PĂR ─────────────
  {
    id: "hair_concerns",
    section: "hair",
    title: "Ce observi la păr sau la scalp?",
    why: "Aceste răspunsuri se combină cu ce vede scanarea ca să alegem tratamentul corect pentru scalp.",
    drives: ["hair_loss_line", "shampoo", "scalp_treatment"],
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
    why: "Căderea recentă și bruscă are alte cauze decât subțierea lentă; ne ajută să alegem corect pasul următor.",
    drives: ["hair_loss_line", "doctor_referral"],
    type: "single",
    showIf: (a) =>
      has(a, "hair_concerns", "thinning") || has(a, "hair_concerns", "recession") || has(a, "hair_concerns", "shedding"),
    options: [
      { value: "lt3m", label: "Sub 3 luni", hint: "Recent, apărut destul de brusc" },
      { value: "3to12m", label: "3–12 luni" },
      { value: "gt1y", label: "Peste un an", hint: "Progres lent, constant" },
    ],
  },
  {
    id: "hair_family",
    section: "hair",
    title: "Au avut rude apropiate subțiere sau chelie?",
    why: "Predispoziția în familie e cel mai bun indicator pentru căderea ereditară.",
    drives: ["hair_loss_line"],
    type: "single",
    showIf: (a) =>
      has(a, "hair_concerns", "thinning") || has(a, "hair_concerns", "recession") || has(a, "hair_concerns", "shedding"),
    options: [
      { value: "yes", label: "Da, la părinți sau frați" },
      { value: "no", label: "Nu" },
      { value: "unknown", label: "Nu știu" },
    ],
  },
  {
    id: "hair_wash",
    section: "hair",
    title: "De câte ori pe săptămână te speli pe cap?",
    why: "Frecvența spălării stabilește ce tip de șampon și ce ritm de tratament se potrivesc.",
    drives: ["shampoo"],
    type: "single",
    options: [
      { value: "0_1", label: "O dată sau mai rar" },
      { value: "2_3", label: "De 2–3 ori" },
      { value: "4_6", label: "De 4–6 ori" },
      { value: "daily", label: "Zilnic" },
    ],
  },

  // ───────────── OCHI ─────────────
  {
    id: "eye_concerns",
    section: "eyes",
    title: "Ce te deranjează în zona ochilor și a sprâncenelor?",
    why: "Determină dacă recomandăm îngrijire pentru ochi sau produse opționale pentru gene și sprâncene.",
    drives: ["eye_cream", "brow_lash_optional"],
    type: "multi",
    options: [
      { value: "none", label: "Nimic", exclusive: true },
      { value: "dark_circles", label: "Cearcăne" },
      { value: "puffiness", label: "Pungi sau umflături dimineața" },
      { value: "sparse_brows", label: "Sprâncene rare" },
      { value: "sparse_lashes", label: "Gene scurte sau rare" },
    ],
  },

  // ───────────── STIL DE VIAȚĂ ─────────────
  {
    id: "sleep_hours",
    section: "lifestyle",
    title: "Câte ore dormi, de obicei, într-o noapte?",
    why: "Somnul influențează direct cearcănele, inflamația pielii și recuperarea după antrenament.",
    drives: ["dark_circles", "training_volume", "recovery"],
    type: "single",
    options: [
      { value: "lt5", label: "Sub 5 ore" },
      { value: "5_6", label: "5–6 ore" },
      { value: "7_8", label: "7–8 ore" },
      { value: "gt9", label: "Peste 9 ore" },
    ],
  },
  {
    id: "sleep_quality",
    section: "lifestyle",
    title: "Cum descrii somnul tău?",
    why: "Orele nu spun tot: somnul întrerupt are alt efect decât cel scurt.",
    drives: ["recovery", "evening_routine"],
    type: "single",
    options: [
      { value: "good", label: "Adorm ușor și dorm continuu" },
      { value: "slow", label: "Adorm greu" },
      { value: "broken", label: "Mă trezesc în timpul nopții" },
      { value: "irregular", label: "Program complet neregulat" },
    ],
  },
  {
    id: "water",
    section: "lifestyle",
    title: "Cât lichid bei pe zi (apă, ceai fără zahăr)?",
    why: "Hidratarea intră direct în planul de alimentație și în recomandările pentru piele.",
    drives: ["nutrition_plan", "hydration"],
    type: "single",
    options: [
      { value: "lt1", label: "Sub 1 litru" },
      { value: "1_2", label: "1–2 litri" },
      { value: "gt2", label: "Peste 2 litri" },
    ],
  },
  {
    id: "habits",
    section: "lifestyle",
    title: "Care dintre acestea ți se potrivesc?",
    why: "Fumatul și alcoolul influențează aspectul pielii și rezultatul tratamentelor.",
    drives: ["skin_outlook", "nutrition_plan"],
    type: "multi",
    options: [
      { value: "none", label: "Niciuna", exclusive: true },
      { value: "smoke", label: "Fumez sau folosesc vape" },
      { value: "alcohol_regular", label: "Alcool de mai multe ori pe săptămână" },
      { value: "high_sugar", label: "Dulciuri sau băuturi dulci zilnic" },
      { value: "high_stress", label: "Stres ridicat în mod constant" },
    ],
  },

  // ───────────── ANTRENAMENT ─────────────
  {
    id: "fitness_goal",
    section: "fitness",
    title: "Care este obiectivul tău fizic principal?",
    why: "Obiectivul decide structura planului de antrenament și caloriile planului de alimentație.",
    drives: ["training_plan", "nutrition_plan"],
    type: "single",
    options: [
      { value: "lose_fat", label: "Slăbesc" },
      { value: "build_muscle", label: "Câștig masă musculară" },
      { value: "recomp", label: "Mă definesc", hint: "Pierd grăsime și păstrez sau câștig mușchi" },
      { value: "general", label: "Energie și sănătate generală" },
      { value: "none", label: "Nu vreau plan de antrenament" },
    ],
  },
  {
    id: "fitness_level",
    section: "fitness",
    title: "Cum te-ai antrenat în ultimele 6 luni?",
    why: "Punctul de start decide intensitatea. Un plan prea greu te face să renunți după două săptămâni.",
    drives: ["training_plan"],
    type: "single",
    showIf: (a) => !has(a, "fitness_goal", "none"),
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
    drives: ["training_plan"],
    type: "single",
    showIf: (a) => !has(a, "fitness_goal", "none"),
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
    drives: ["training_plan"],
    type: "single",
    showIf: (a) => !has(a, "fitness_goal", "none"),
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
    drives: ["training_plan"],
    type: "multi",
    showIf: (a) => !has(a, "fitness_goal", "none"),
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
    why: "Mesele din plan le exclud automat. Pentru alergii severe, urmează întotdeauna indicațiile medicului.",
    drives: ["nutrition_plan"],
    type: "multi",
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
    drives: ["nutrition_plan"],
    type: "single",
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
    drives: ["nutrition_plan"],
    type: "single",
    options: [
      { value: "lt15", label: "Sub 15 minute" },
      { value: "15_30", label: "15–30 de minute" },
      { value: "gt30", label: "Peste 30 de minute" },
      { value: "eat_out", label: "Mănânc mai mult în oraș sau comand" },
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
