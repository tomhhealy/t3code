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
type RateLimitWindowKind = "primary" | "secondary" | "other";

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

function firstNonNull<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
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

function parseWindowDurationMins(record: UnknownRecord): number | null {
  const direct = firstNonNull(
    asFiniteNumber(record.windowDurationMins),
    asFiniteNumber(record.window_duration_mins),
    asFiniteNumber(record.windowMinutes),
    asFiniteNumber(record.window_minutes),
  );
  if (direct !== null) {
    return direct;
  }

  const rawWindow = asNonEmptyString(record.window) ?? asNonEmptyString(record.windowName);
  if (!rawWindow) {
    return null;
  }
  const normalized = rawWindow.trim().toLowerCase();
  if (normalized === "weekly" || normalized === "week" || normalized === "7d") {
    return 10080;
  }
  const hourMatch = normalized.match(/^(\d+(?:\.\d+)?)h$/);
  if (hourMatch) {
    return Math.round(Number(hourMatch[1]) * 60);
  }
  const dayMatch = normalized.match(/^(\d+(?:\.\d+)?)d$/);
  if (dayMatch) {
    return Math.round(Number(dayMatch[1]) * 24 * 60);
  }
  return null;
}

function classifyRateLimitWindow(window: RateLimitWindowSummary): RateLimitWindowKind {
  if (window.windowDurationMins === 300) return "primary";
  if (window.windowDurationMins === 10080) return "secondary";

  const normalizedLabel = window.label.trim().toLowerCase();
  if (normalizedLabel.includes("5 hour") || normalizedLabel === "5h") return "primary";
  if (normalizedLabel.includes("week")) return "secondary";
  return "other";
}

function parseRateLimitWindow(
  value: unknown,
  fallbackLabel: string,
): RateLimitWindowSummary | null {
  const record = asRecord(value);
  if (!record) return null;

  const windowDurationMins = parseWindowDurationMins(record);
  const explicitUsedPercent = firstNonNull(
    normalizePercent(record.usedPercent),
    normalizePercent(record.used_percent),
    normalizePercent(record.usagePercent),
    normalizePercent(record.usage_percent),
    normalizePercent(record.percentUsed),
    normalizePercent(record.percent_used),
  );
  const remainingPercent = firstNonNull(
    normalizePercent(record.remainingPercent),
    normalizePercent(record.remaining_percent),
    normalizePercent(record.percentRemaining),
    normalizePercent(record.percent_remaining),
  );
  const usedValue = firstNonNull(
    asFiniteNumber(record.used),
    asFiniteNumber(record.current),
    asFiniteNumber(record.consumed),
  );
  const limitValue = firstNonNull(
    asFiniteNumber(record.limit),
    asFiniteNumber(record.max),
    asFiniteNumber(record.total),
  );
  const usedPercent =
    explicitUsedPercent ??
    (remainingPercent !== null ? 100 - remainingPercent : null) ??
    (usedValue !== null && limitValue !== null && limitValue > 0
      ? (usedValue / limitValue) * 100
      : null);

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

function parseRateLimitSnapshotFromLimits(root: UnknownRecord): RateLimitSnapshotSummary | null {
  const limits = Array.isArray(root.limits) ? root.limits : null;
  if (!limits || limits.length === 0) {
    return null;
  }

  let primary: RateLimitWindowSummary | null = null;
  let secondary: RateLimitWindowSummary | null = null;

  for (const limit of limits) {
    const window = parseRateLimitWindow(limit, "Usage Limit");
    if (!window) {
      continue;
    }
    const kind = classifyRateLimitWindow(window);
    if (kind === "primary" && primary === null) {
      primary = window;
      continue;
    }
    if (kind === "secondary" && secondary === null) {
      secondary = window;
      continue;
    }
    if (primary === null) {
      primary = window;
      continue;
    }
    if (secondary === null) {
      secondary = window;
    }
  }

  if (!primary && !secondary) {
    return null;
  }

  const firstLimit = limits.find((entry) => asRecord(entry)) ?? null;
  const firstLimitRecord = firstLimit ? asRecord(firstLimit) : null;

  return {
    primary,
    secondary,
    planType: asNonEmptyString(root.planType) ?? asNonEmptyString(root.plan_type),
    limitId:
      asNonEmptyString(root.limitId) ??
      asNonEmptyString(root.limit_id) ??
      asNonEmptyString(firstLimitRecord?.model) ??
      asNonEmptyString(firstLimitRecord?.limitId),
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
    return parseRateLimitSnapshotFromLimits(root);
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

export function formatRateLimitPercent(value: number | null): string {
  if (value === null) {
    return "--";
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function summarizeRateLimitPair(snapshot: RateLimitSnapshotSummary | null): string {
  if (!snapshot) {
    return "No data";
  }
  return `${formatRateLimitPercent(snapshot.primary?.usedPercent ?? null)} / ${formatRateLimitPercent(snapshot.secondary?.usedPercent ?? null)}`;
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
  const info = asRecord(usage?.info) ?? usage;
  const tokenUsage = asRecord(info?.tokenUsage) ?? info;
  const lastUsage =
    asRecord(info?.last_token_usage) ??
    asRecord(info?.lastTokenUsage) ??
    asRecord(tokenUsage?.last_token_usage) ??
    asRecord(tokenUsage?.lastTokenUsage);
  const totalUsage =
    asRecord(info?.total_token_usage) ??
    asRecord(info?.totalTokenUsage) ??
    asRecord(tokenUsage?.total_token_usage) ??
    asRecord(tokenUsage?.totalTokenUsage);
  const total = asRecord(tokenUsage?.total);
  const preferred = lastUsage ?? total ?? totalUsage ?? tokenUsage;

  return {
    totalTokens:
      firstNonNull(
        asFiniteNumber(preferred?.totalTokens),
        asFiniteNumber(preferred?.total_tokens),
        asFiniteNumber(total?.totalTokens),
        asFiniteNumber(total?.total_tokens),
        asFiniteNumber(tokenUsage?.totalTokens),
        asFiniteNumber(tokenUsage?.total_tokens),
      ) ?? null,
    inputTokens:
      firstNonNull(
        asFiniteNumber(preferred?.inputTokens),
        asFiniteNumber(preferred?.input_tokens),
        asFiniteNumber(total?.inputTokens),
        asFiniteNumber(total?.input_tokens),
        asFiniteNumber(tokenUsage?.inputTokens),
        asFiniteNumber(tokenUsage?.input_tokens),
      ) ?? null,
    outputTokens:
      firstNonNull(
        asFiniteNumber(preferred?.outputTokens),
        asFiniteNumber(preferred?.output_tokens),
        asFiniteNumber(total?.outputTokens),
        asFiniteNumber(total?.output_tokens),
        asFiniteNumber(tokenUsage?.outputTokens),
        asFiniteNumber(tokenUsage?.output_tokens),
      ) ?? null,
    cachedInputTokens:
      firstNonNull(
        asFiniteNumber(preferred?.cachedInputTokens),
        asFiniteNumber(preferred?.cached_input_tokens),
        asFiniteNumber(total?.cachedInputTokens),
        asFiniteNumber(total?.cached_input_tokens),
        asFiniteNumber(tokenUsage?.cachedInputTokens),
        asFiniteNumber(tokenUsage?.cached_input_tokens),
      ) ?? null,
    reasoningOutputTokens:
      firstNonNull(
        asFiniteNumber(preferred?.reasoningOutputTokens),
        asFiniteNumber(preferred?.reasoning_output_tokens),
        asFiniteNumber(total?.reasoningOutputTokens),
        asFiniteNumber(total?.reasoning_output_tokens),
        asFiniteNumber(tokenUsage?.reasoningOutputTokens),
        asFiniteNumber(tokenUsage?.reasoning_output_tokens),
      ) ?? null,
    modelContextWindow:
      firstNonNull(
        asFiniteNumber(info?.modelContextWindow),
        asFiniteNumber(info?.model_context_window),
        asFiniteNumber(tokenUsage?.modelContextWindow),
        asFiniteNumber(tokenUsage?.model_context_window),
        asFiniteNumber(usage?.modelContextWindow),
        asFiniteNumber(usage?.model_context_window),
      ) ?? null,
  };
}

export interface ContextWindowUsageSummary {
  totalTokens: number;
  modelContextWindow: number;
  usedPercent: number;
}

function deriveContextWindowTotalTokens(tokenUsage: TokenUsageSummary): number | null {
  if (tokenUsage.totalTokens !== null && tokenUsage.totalTokens > 0) {
    return tokenUsage.totalTokens;
  }

  const parts = [
    tokenUsage.inputTokens,
    tokenUsage.cachedInputTokens,
    tokenUsage.outputTokens,
  ].filter((value): value is number => value !== null && value > 0);

  if (parts.length === 0) {
    return null;
  }

  return parts.reduce((sum, value) => sum + value, 0);
}

export function getContextWindowUsage(
  tokenUsage: TokenUsageSummary | null,
): ContextWindowUsageSummary | null {
  if (!tokenUsage) {
    return null;
  }
  const totalTokens = deriveContextWindowTotalTokens(tokenUsage);
  if (!totalTokens || !tokenUsage.modelContextWindow || tokenUsage.modelContextWindow <= 0) {
    return null;
  }

  return {
    totalTokens,
    modelContextWindow: tokenUsage.modelContextWindow,
    usedPercent: Math.max(0, Math.min(100, (totalTokens / tokenUsage.modelContextWindow) * 100)),
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
