import type { OrchestrationThreadActivity } from "@t3tools/contracts";

export interface RateLimitWindowSummary {
  label: string;
  usedPercent: number | null;
  resetsAt: string | null;
  windowDurationMins: number | null;
}

export interface RateLimitSnapshotSummary {
  primary: RateLimitWindowSummary | null;
  secondary: RateLimitWindowSummary | null;
  planType: string | null;
  limitId: string | null;
}

export interface TokenUsageSummary {
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningOutputTokens: number | null;
  modelContextWindow: number | null;
}

export interface ModelUsageEntry {
  id: string;
  modelLabel: string;
  windowLabel: string;
  usedPercent: number | null;
  usedText: string | null;
  limitText: string | null;
  remainingText: string | null;
  resetsAt: string | null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePercent(value: unknown): number | null {
  const usedPercent = asFiniteNumber(value);
  if (usedPercent === null) return null;
  return usedPercent <= 1 ? usedPercent * 100 : usedPercent;
}

function normalizeResetTimestamp(value: unknown): string | null {
  const iso = asNonEmptyString(value);
  if (iso) return iso;

  const epochSeconds = asFiniteNumber(value);
  if (epochSeconds === null) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

function labelForWindowDuration(windowDurationMins: number | null, fallback: string): string {
  if (windowDurationMins === 300) return "5 Hour Limit";
  if (windowDurationMins === 10080) return "Weekly Limit";
  if (windowDurationMins === null) return fallback;
  if (windowDurationMins % (60 * 24 * 7) === 0) return "Weekly Limit";
  if (windowDurationMins % 60 === 0) return `${Math.round(windowDurationMins / 60)} Hour Limit`;
  return fallback;
}

function parseRateLimitWindow(
  value: unknown,
  fallbackLabel: string,
): RateLimitWindowSummary | null {
  const record = asRecord(value);
  if (!record) return null;

  const windowDurationMins =
    asFiniteNumber(record.windowDurationMins) ?? asFiniteNumber(record.window_duration_mins);
  const usedPercent =
    (normalizePercent(record.usedPercent) ??
    normalizePercent(record.used_percent) ??
    normalizePercent(record.remainingPercent) !== null)
      ? 100 - (normalizePercent(record.remainingPercent) ?? 0)
      : null;

  if (usedPercent === null && windowDurationMins === null && !record.resetsAt && !record.reset_at) {
    return null;
  }

  return {
    label: labelForWindowDuration(windowDurationMins, fallbackLabel),
    usedPercent: usedPercent === null ? null : Math.max(0, Math.min(100, usedPercent)),
    resetsAt: normalizeResetTimestamp(record.resetsAt ?? record.reset_at),
    windowDurationMins,
  };
}

export function getRateLimitSnapshot(rateLimits: unknown): RateLimitSnapshotSummary | null {
  const root = asRecord(rateLimits);
  if (!root) return null;

  const primary = parseRateLimitWindow(root.primary, "Primary Limit");
  const secondary = parseRateLimitWindow(root.secondary, "Secondary Limit");
  const planType = asNonEmptyString(root.planType) ?? asNonEmptyString(root.plan_type);
  const limitId = asNonEmptyString(root.limitId) ?? asNonEmptyString(root.limit_id);

  if (!primary && !secondary) {
    return null;
  }

  return {
    primary,
    secondary,
    planType,
    limitId,
  };
}

export function getLatestRateLimitSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): RateLimitSnapshotSummary | null {
  const latestRateLimitsActivity = activities
    .toReversed()
    .find((activity) => activity.kind === "account.rate-limits.updated");

  if (!latestRateLimitsActivity) {
    return null;
  }

  const payload = asRecord(latestRateLimitsActivity.payload);
  return getRateLimitSnapshot(payload?.rateLimits ?? latestRateLimitsActivity.payload);
}

export function summarizeRateLimitSnapshot(snapshot: RateLimitSnapshotSummary | null): string {
  if (!snapshot) return "No data";
  const values = [snapshot.primary?.usedPercent, snapshot.secondary?.usedPercent].filter(
    (value): value is number => value !== null && value !== undefined,
  );
  if (values.length === 0) return "No data";
  const highest = Math.max(...values);
  return `${highest.toFixed(highest >= 10 ? 0 : 1)}%`;
}

export function getLatestTokenUsage(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): TokenUsageSummary | null {
  const latestTokenUsageActivity = activities
    .toReversed()
    .find((activity) => activity.kind === "thread.token-usage.updated");

  if (!latestTokenUsageActivity) {
    return null;
  }

  const payload = asRecord(latestTokenUsageActivity.payload);
  const usage = asRecord(payload?.usage) ?? payload;
  const tokenUsage = asRecord(usage?.tokenUsage) ?? usage;
  const total = asRecord(tokenUsage?.total);

  return {
    totalTokens: asFiniteNumber(total?.totalTokens) ?? asFiniteNumber(tokenUsage?.totalTokens),
    inputTokens: asFiniteNumber(total?.inputTokens) ?? asFiniteNumber(tokenUsage?.inputTokens),
    outputTokens: asFiniteNumber(total?.outputTokens) ?? asFiniteNumber(tokenUsage?.outputTokens),
    cachedInputTokens:
      asFiniteNumber(total?.cachedInputTokens) ?? asFiniteNumber(tokenUsage?.cachedInputTokens),
    reasoningOutputTokens:
      asFiniteNumber(total?.reasoningOutputTokens) ??
      asFiniteNumber(tokenUsage?.reasoningOutputTokens),
    modelContextWindow:
      asFiniteNumber(tokenUsage?.modelContextWindow) ?? asFiniteNumber(usage?.modelContextWindow),
  };
}

function formatCompactNumber(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function remainingPercentFromUsedPercent(usedPercent: number | null): number | null {
  if (usedPercent === null) return null;
  return Math.max(0, Math.min(100, 100 - usedPercent));
}

function toModelUsageEntry(
  id: string,
  modelLabel: string,
  window: RateLimitWindowSummary,
): ModelUsageEntry {
  const usedText = formatCompactNumber(window.usedPercent);
  const remainingPercent = remainingPercentFromUsedPercent(window.usedPercent);
  const remainingText = formatCompactNumber(remainingPercent);

  return {
    id,
    modelLabel,
    windowLabel: window.label,
    usedPercent: window.usedPercent,
    usedText: usedText === null ? null : `${usedText}%`,
    limitText: "100%",
    remainingText: remainingText === null ? null : `${remainingText}%`,
    resetsAt: window.resetsAt,
  };
}

export function getModelUsageFromRateLimits(rateLimits: unknown): ModelUsageEntry[] {
  const snapshot = getRateLimitSnapshot(rateLimits);
  if (!snapshot) {
    return [];
  }

  const entries: ModelUsageEntry[] = [];
  const baseLabel = snapshot.limitId ?? snapshot.planType ?? "Account";

  if (snapshot.primary) {
    entries.push(toModelUsageEntry(`${baseLabel}:primary`, baseLabel, snapshot.primary));
  }

  if (snapshot.secondary) {
    entries.push(toModelUsageEntry(`${baseLabel}:secondary`, baseLabel, snapshot.secondary));
  }

  return entries;
}

export function getLatestModelUsage(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ModelUsageEntry[] {
  const snapshot = getLatestRateLimitSnapshot(activities);
  if (!snapshot) {
    return [];
  }

  return getModelUsageFromRateLimits(snapshot);
}

export function summarizeModelUsage(entries: ReadonlyArray<ModelUsageEntry>): string {
  const values = entries
    .map((entry) => entry.usedPercent)
    .filter((value): value is number => value !== null && value !== undefined);

  if (values.length === 0) {
    return "No data";
  }

  const highest = Math.max(...values);
  return `${highest.toFixed(highest >= 10 ? 0 : 1)}%`;
}
