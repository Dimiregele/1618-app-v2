// Tipuri aliniate 1:1 cu 1618_schema.sql.
// Când schema se schimbă, actualizează și fișierul ăsta (sau generează-l cu
// `supabase gen types typescript` odată ce avem un proiect Supabase real).

export type SubscriptionTier = "fix" | "refine" | "maintain";
export type ScanStatus = "pending" | "completed" | "failed";
export type FulfillmentMode = "dropship" | "private_label_3pl";
export type OrderType = "one_time" | "subscription_shipment";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  country_code: string | null;
  locale: string;
  created_at: string;
}

export interface IssueCategory {
  slug: string;
  vertical: "skin" | "hair" | "eyes" | string;
  display_name: Record<string, string>;
}

export interface Scan {
  id: string;
  user_id: string;
  previous_scan_id: string | null;
  source: string; // 'haut_ai' | 'perfect_corp' | 'revieve' | 'manual' — de fixat
  vendor_scan_ref: string | null;
  status: ScanStatus;
  raw_payload_deleted: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface ScanIssue {
  id: string;
  scan_id: string;
  issue_slug: string;
  severity: number;
  confidence: number | null;
  region: string | null;
  raw_vendor_data: Record<string, unknown> | null;
}

export interface QuestionnaireResponse {
  id: string;
  user_id: string;
  scan_id: string;
  answers: Record<string, unknown>;
  created_at: string;
}

export interface ProductCategory {
  slug: string;
  display_name: Record<string, string>;
  is_optional_category: boolean;
}

export interface Product {
  id: string;
  category_slug: string;
  sku: string | null;
  name: string;
  description: string | null;
  is_otc: boolean;
  requires_pharmacy_partner: boolean;
  regulatory_regions: string[] | null;
  cost_eur: number | null;
  list_price_eur: number | null;
  fulfillment_mode: FulfillmentMode;
  consumption_cycle_months: number;
  active: boolean;
  created_at: string;
}

export interface Recommendation {
  id: string;
  scan_id: string;
  product_id: string;
  addressed_issue_slug: string | null;
  priority: number;
  is_optional: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  tier: SubscriptionTier;
  status: string;
  billing_interval: string;
  commitment_started_at: string;
  commitment_min_cycles: number;
  cycles_completed: number;
  cancel_requested_at: string | null;
  cancel_effective_at: string | null;
  created_at: string;
}

export interface SubscriptionItem {
  id: string;
  subscription_id: string;
  product_id: string;
  delivery_interval_cycles: number;
  last_shipped_at: string | null;
  next_ship_at: string | null;
  active: boolean;
}

export interface Order {
  id: string;
  user_id: string;
  subscription_id: string | null;
  order_type: OrderType;
  stripe_payment_intent_id: string | null;
  status: string;
  distributor_ref: string | null;
  shipped_at: string | null;
  created_at: string;
}

export interface Guide {
  id: string;
  scan_id: string;
  user_id: string;
  usage_guide: Record<string, unknown> | null;
  nutrition_plan: Record<string, unknown> | null;
  training_plan: Record<string, unknown> | null;
  generated_at: string;
}

// Placeholder minim — Supabase JS îl acceptă ca generic pt. createClient<Database>.
// Poate rămâne gol/relaxat până generăm tipurile reale din proiectul live.
export type Database = Record<string, unknown>;
