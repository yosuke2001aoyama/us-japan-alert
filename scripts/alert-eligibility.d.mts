export type AlertItemLike = {
  title?: string;
  summary?: string;
  transcript?: string;
  source?: string;
  publishedAt?: string;
  priority?: number;
  japanRelated?: boolean;
  official?: boolean;
  socialPost?: boolean;
  spokenEvent?: boolean;
  verifiedSource?: boolean;
  coverage?: string;
  verification?: string;
};

export type ImmediateAlertAssessment = {
  notify: boolean;
  label: string;
  code: string;
};

export type TimelineImportance = {
  tier: "breaking" | "important" | "monitor";
  label: "速報" | "重要" | "監視";
  code: string;
};

export const DEFAULT_MAX_ALERT_AGE_MS: number;
export const STARTUP_RECOVERY_AGE_MS: number;
export function classifyImmediateAlert(
  item: AlertItemLike,
  options?: { now?: number; maxAgeMs?: number },
): ImmediateAlertAssessment;
export function classifyTimelineImportance(
  item: AlertItemLike,
  options?: { now?: number; maxAgeMs?: number },
): TimelineImportance;
