import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { memo, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { getContextWindowUsage, getLatestTokenUsage } from "~/modelUsage";

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatFullNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function remainingPercent(usedPercent: number): number {
  return Math.max(0, 100 - usedPercent);
}

function contextPressureLabel(usedPercent: number): string {
  if (usedPercent >= 90) return "Compacting";
  if (usedPercent >= 75) return "High pressure";
  if (usedPercent >= 45) return "Moderate pressure";
  return "Stable";
}

function contextPressureDetail(usedPercent: number): string {
  if (usedPercent >= 90) {
    return "The active window is full, but chat continues through automatic compaction.";
  }
  if (usedPercent >= 75) {
    return "Auto-compaction is likely soon as the conversation grows.";
  }
  if (usedPercent >= 45) {
    return "The conversation is filling the active context window.";
  }
  return "There is plenty of active context available.";
}

function usageToneClassName(usedPercent: number): string {
  if (usedPercent >= 85) return "text-destructive";
  if (usedPercent >= 60) return "text-warning";
  return "text-success";
}

export const ThreadContextUsageIndicator = memo(function ThreadContextUsageIndicator({
  activities,
}: {
  activities: ReadonlyArray<OrchestrationThreadActivity>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const contextUsage = useMemo(
    () => getContextWindowUsage(getLatestTokenUsage(activities)),
    [activities],
  );

  if (!contextUsage) {
    return null;
  }

  const usedPercent = Math.max(0, Math.min(100, contextUsage.usedPercent));
  const ringDegrees = (usedPercent / 100) * 360;
  const remaining = remainingPercent(usedPercent);
  const toneClassName = usageToneClassName(contextUsage.usedPercent);
  const pressureLabel = contextPressureLabel(usedPercent);
  const pressureDetail = contextPressureDetail(usedPercent);

  return (
    <div
      className="relative flex shrink-0 items-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="relative flex h-6 w-6 items-center justify-center rounded-full text-foreground/58 transition-opacity hover:text-foreground/72"
        aria-label={`Context ${pressureLabel.toLowerCase()}, ${formatPercent(usedPercent)} of the active window`}
        title={`Context window: ${pressureLabel}. ${formatCompactNumber(contextUsage.totalTokens)} / ${formatCompactNumber(contextUsage.modelContextWindow)} active tokens.`}
      >
        <div className={cn("relative h-[22px] w-[22px]", toneClassName)} aria-hidden="true">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from -90deg, currentColor 0deg ${ringDegrees}deg, color-mix(in srgb, currentColor 16%, transparent) ${ringDegrees}deg 360deg)`,
            }}
          />
          <div className="absolute inset-[2px] rounded-full bg-background/96" />
          <div className="absolute inset-0 rounded-full border border-foreground/12" />
          {usedPercent > 0 ? (
            <div
              className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-[9px] rounded-full bg-current shadow-[0_0_0_1px_color-mix(in_srgb,var(--background)_72%,transparent)]"
              style={{ transform: `translate(-50%, -9px) rotate(${ringDegrees}deg)` }}
            />
          ) : null}
        </div>
      </button>
      {isOpen ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 w-[18rem] max-w-none -translate-x-1/2">
          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/96 text-card-foreground shadow-lg/8 backdrop-blur-md before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-2xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]">
            <div className="border-b border-border/70 bg-muted/18 px-4 py-3">
              <div className="text-xs font-medium tracking-[0.02em] text-muted-foreground">
                Context window
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className={cn("text-lg font-semibold", toneClassName)}>{pressureLabel}</span>
                <span className="text-sm text-muted-foreground">
                  {`${formatPercent(contextUsage.usedPercent)} active`}
                </span>
              </div>
            </div>
            <div className="space-y-3 px-4 py-3.5">
              <div className="rounded-xl border border-border/70 bg-muted/12 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">Active context</span>
                  <span className="text-xs text-muted-foreground">Current chat</span>
                </div>
                <div className="mt-1.5 text-sm font-semibold text-foreground">
                  {formatCompactNumber(contextUsage.totalTokens)} /{" "}
                  {formatCompactNumber(contextUsage.modelContextWindow)} tokens
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {`${formatFullNumber(contextUsage.totalTokens)} / ${formatFullNumber(contextUsage.modelContextWindow)} tokens`}
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/55">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-200",
                      toneClassName,
                    )}
                    style={{ width: `${contextUsage.usedPercent}%` }}
                  />
                </div>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {pressureDetail}
                </p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {remaining > 0
                    ? `${formatPercent(remaining)} of the active window remains before compaction pressure increases.`
                    : "Older context will be compacted so the conversation can continue."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
