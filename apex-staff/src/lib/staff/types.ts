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
  base_pay_weekly: number;
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
