import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { memo, useMemo } from "react";

import { cn } from "~/lib/utils";
import { getContextWindowUsage, getLatestTokenUsage } from "~/modelUsage";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

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

function usageStrokeClassName(usedPercent: number): string {
  if (usedPercent >= 85) return "stroke-destructive";
  if (usedPercent >= 60) return "stroke-warning";
  return "stroke-success";
}

export const ThreadContextUsageIndicator = memo(function ThreadContextUsageIndicator({
  activities,
}: {
  activities: ReadonlyArray<OrchestrationThreadActivity>;
}) {
  const contextUsage = useMemo(
    () => getContextWindowUsage(getLatestTokenUsage(activities)),
    [activities],
  );

  if (!contextUsage) {
    return null;
  }

  const usedPercent = Math.max(0, Math.min(100, contextUsage.usedPercent));
  const toneClassName = usageToneClassName(contextUsage.usedPercent);
  const strokeClassName = usageStrokeClassName(contextUsage.usedPercent);
  const pressureLabel = contextPressureLabel(usedPercent);
  const pressureDetail = contextPressureDetail(usedPercent);
  const circleSize = 14;
  const strokeWidth = 1.75;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference * (1 - usedPercent / 100);

  return (
    <Popover>
      <PopoverTrigger
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-foreground/56 outline-none transition-colors hover:text-foreground/72 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        aria-label={`Context ${pressureLabel.toLowerCase()}, ${formatPercent(usedPercent)} of the active window`}
        title={`Context window: ${pressureLabel}. ${formatCompactNumber(contextUsage.totalTokens)} / ${formatCompactNumber(contextUsage.modelContextWindow)} active tokens.`}
      >
        <svg
          aria-hidden="true"
          className="size-3.5 overflow-visible"
          viewBox={`0 0 ${circleSize} ${circleSize}`}
        >
          <circle
            className="stroke-foreground/14"
            cx={circleSize / 2}
            cy={circleSize / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
          />
          <circle
            className={cn("transition-[stroke-dashoffset] duration-200 ease-out", strokeClassName)}
            cx={circleSize / 2}
            cy={circleSize / 2}
            r={radius}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={progressOffset}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            transform={`rotate(-90 ${circleSize / 2} ${circleSize / 2})`}
          />
        </svg>
      </PopoverTrigger>
      <PopoverPopup align="end" side="top" sideOffset={8} className="w-[18rem] p-0">
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
              <p className="text-[12px] leading-relaxed text-muted-foreground">{pressureDetail}</p>
            </div>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
});
