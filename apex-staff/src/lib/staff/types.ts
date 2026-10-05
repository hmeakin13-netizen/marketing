export type StaffRole = "admin" | "manager" | "closer" | "setter";

export type CallOutcome =
  | "scheduled"
  | "no_show"
  | "cancelled"
  | "follow_up"
  | "lost"
  | "closed";

export type PaymentType = "paid_in_full" | "deposit" | "payment_plan";

export interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
  calendly_email: string | null;
  login_enabled: boolean;
  manager_id: string | null;
  created_at: string;
  deactivated_at: string | null;
}

export interface CallRow {
  id: string;
  lead_name: string;
  lead_email: string | null;
  lead_phone: string | null;
  source: string | null;
  setter_id: string | null;
  closer_id: string | null;
  booked_at: string;
  call_at: string;
  outcome: CallOutcome;
  outcome_logged_at: string | null;
  recording_url: string | null;
  notes: string | null;
}

export interface PaymentRow {
  id: string;
  close_id: string;
  amount: number;
  paid_at: string;
  method: string;
  note: string | null;
  recorded_by: string | null;
}

export interface CloseRow {
  id: string;
  call_id: string;
  closer_id: string | null;
  setter_id: string | null;
  deal_value: number;
  payment_type: PaymentType;
  next_payment_due: string | null;
  notes: string | null;
  closed_at: string;
  payments: PaymentRow[];
  calls?: { lead_name: string; source: string | null; recording_url: string | null } | null;
}

export interface TargetRow {
  id: string;
  staff_id: string;
  metric: TargetMetric;
  period: "week" | "month";
  target: number;
}

export type TargetMetric =
  | "calls_booked"
  | "calls_taken"
  | "show_rate"
  | "close_rate"
  | "closes"
  | "cash_collected";

export interface PayRow {
  staff_id: string;
  commission_pct: number;
  basis: "own_closes" | "own_bookings" | "team_cash";
  base_pay_weekly: number; // legacy, unused
  retainer_monthly: number; // flat monthly fee (for people paid a flat fee)
  retainer_share_pct: number; // % of each active client's monthly fee
  override_pct: number;
  override_basis: "client_fee" | "deal_value" | "cash";
  pay_schedule: "monthly" | "semi_monthly";
  payee_name: string | null;
  payee_address: string | null;
  vat_number: string | null;
  agreement_date: string | null;
}

export interface InvoiceLine {
  description: string;
  amount: number;
}

export interface InvoiceRow {
  id: string;
  seq: number;
  staff_id: string;
  period_start: string;
  period_end: string;
  period_label: string;
  lines: InvoiceLine[];
  subtotal: number;
  vat: number;
  total: number;
  status: "issued" | "paid" | "void";
  emailed_at: string | null;
  email_error: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_email: string | null;
  table_name: string;
  row_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  manager: "Manager",
  closer: "Closer",
  setter: "Setter",
};

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  scheduled: "Scheduled",
  no_show: "No show",
  cancelled: "Cancelled",
  follow_up: "Showed – follow up",
  lost: "Showed – lost",
  closed: "Closed",
};

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  paid_in_full: "Paid in full",
  deposit: "Deposit",
  payment_plan: "Payment plan",
};

export const METRIC_LABEL: Record<TargetMetric, string> = {
  calls_booked: "Calls booked",
  calls_taken: "Calls taken",
  show_rate: "Show rate %",
  close_rate: "Close rate %",
  closes: "Closes",
  cash_collected: "Cash collected £",
};

export interface ChaseRow {
  id: string;
  close_id: string | null;
  call_id: string | null;
  note: string | null;
  chased_by: string | null;
  chased_by_email: string | null;
  chased_at: string;
}

export interface ShiftRow {
  staff_id: string;
  start_time: string; // "12:00:00"
  end_time: string;
  days: number[]; // ISO weekdays, 1 = Monday
}

export interface RetainerClient {
  id: string;
  name: string;
  closer_id: string | null;
  setter_id: string | null;
  close_id: string | null;
  setup_fee: number; // one-time
  monthly_fee: number; // recurring retainer
  start_date: string; // YYYY-MM-DD
  billing_day: number;
  end_date: string | null;
  notes: string | null;
  created_at: string;
}
