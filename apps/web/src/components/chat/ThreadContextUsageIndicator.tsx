import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { memo, useMemo, useState } from "react";

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

  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - contextUsage.usedPercent / 100);
  const remaining = remainingPercent(contextUsage.usedPercent);

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
        className="group relative flex h-6 w-6 items-center justify-center rounded-full text-foreground/58 transition-opacity hover:text-foreground/72"
        aria-label={`Context usage ${formatPercent(contextUsage.usedPercent)}`}
        title={`Context window: ${formatPercent(contextUsage.usedPercent)} used (${formatPercent(remaining)} left)`}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle
            cx="16"
            cy="16"
            r={radius}
            stroke="currentColor"
            strokeWidth="2.6"
            className="text-foreground/12"
          />
          <circle
            cx="16"
            cy="16"
            r={radius}
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            className="origin-center text-foreground/60 transition-[stroke-dashoffset,opacity] duration-200"
            transform="rotate(-90 16 16)"
          />
        </svg>
      </button>
      {isOpen ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 w-80 max-w-none -translate-x-1/2 rounded-3xl border border-border/70 bg-popover/96 text-center text-sm shadow-xl backdrop-blur-sm">
          <div className="space-y-4 px-5 py-4">
            <div className="text-[0.95rem] font-medium text-muted-foreground">Context window:</div>
            <div className="space-y-1.5">
              <div className="text-[1.05rem] font-semibold text-foreground">
                {formatPercent(contextUsage.usedPercent)} used{" "}
                <span className="text-muted-foreground">({formatPercent(remaining)} left)</span>
              </div>
              <div className="text-[0.95rem] font-semibold text-foreground">
                {formatCompactNumber(contextUsage.totalTokens)} /{" "}
                {formatCompactNumber(contextUsage.modelContextWindow)} tokens used
              </div>
              <div className="text-[0.78rem] text-muted-foreground">
                {`${formatFullNumber(contextUsage.totalTokens)} / ${formatFullNumber(contextUsage.modelContextWindow)} tokens`}
              </div>
            </div>
            <div className="text-balance text-[0.95rem] font-semibold leading-snug text-foreground">
              Codex automatically compacts its context
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
