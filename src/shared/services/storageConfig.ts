export const SCOPED_KEYS = [
  "p21_leads",
  "p21_movements",
  "p21_sessions",
  "p21_meetings",
  "p21_goals_settings",
  "p21_stages_cold_call",
  "p21_stages_oportunidades",
  "p21_stages_onboarding",
  "p21_finance_tx",
  "p21_scrum_tasks",
  "p21_scrum_sprints",
  "p21_daily_tasks",
  "p21_daily_checks",
  "p21_reminders",
  "p21_reminder_templates",
  "p21_filters_cold_call",
  "p21_filters_oportunidades",
  "p21_filters_onboarding",
  "p21_selected_script",
  "p21_call_logs",
  "p21_insights",
  "p21_rule_overrides",
  "p21_insights_last_run",
  "p21_history",
  "p21_bottleneck_history",
  "p21_central_filters",
  "p21_lab_filters",
  "p21_lab_experiments",
  "p21_cadence_overrides",
  "p21_lead_tasks",
  "p21_diretor_ia_last_run",
  "p21_diretor_ia_history",
  "p21_scripts",
  "p21_activity_ledger",
  "p21_daily_metrics_reports",
  "p21_deleted_leads_tombstones",
] as const;

export type ScopedStorageKey = (typeof SCOPED_KEYS)[number];

const scopedKeySet = new Set<string>(SCOPED_KEYS);

export const HEAVY_KEYS = new Set<string>([
  "p21_leads",
  "p21_movements",
  "p21_sessions",
  "p21_meetings",
]);

const PROTECTED_CONFIG_KEYS = new Set<string>([
  "p21_cadence_overrides",
  "p21_reminder_templates",
  "p21_diretor_ia_history",
  "p21_diretor_ia_last_run",
  "p21_scripts",
]);

export function isScopedKey(key: string): key is ScopedStorageKey {
  return scopedKeySet.has(key);
}

export function isHeavyKey(key: string): boolean {
  return HEAVY_KEYS.has(key);
}

export function isProtectedConfigKey(key: string): boolean {
  return PROTECTED_CONFIG_KEYS.has(key);
}

export function isEmptyStorageValue(value: unknown): boolean {
  return (
    value == null ||
    (Array.isArray(value) && value.length === 0) ||
    (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0
    )
  );
}
