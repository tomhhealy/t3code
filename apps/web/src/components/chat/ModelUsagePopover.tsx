import type { ThreadId } from "@t3tools/contracts";
import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { ChartNoAxesColumnIcon, RefreshCcwIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatResetCountdown,
  getRateLimitSnapshot,
  getLatestModelUsage,
  getModelUsageFromRateLimits,
  getLatestRateLimitSnapshot,
  summarizeRateLimitPair,
} from "~/modelUsage";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

function formatResetTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function usageToneClassName(usedPercent: number | null): string {
  if (usedPercent === null) return "bg-muted";
  if (usedPercent >= 85) return "bg-destructive";
  if (usedPercent >= 60) return "bg-warning";
  return "bg-success";
}

function usageBadgeVariant(
  usedPercent: number | null,
): "outline" | "success" | "warning" | "destructive" {
  if (usedPercent === null) return "outline";
  if (usedPercent >= 85) return "destructive";
  if (usedPercent >= 60) return "warning";
  return "success";
}

function formatUsagePercent(usedPercent: number | null): string {
  if (usedPercent === null) return "Unknown";
  return `${usedPercent.toFixed(usedPercent >= 10 ? 0 : 1)}%`;
}

function formatRefreshError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to refresh rate limits.";
  }
  const firstLine = error.message.split("\n")[0]?.trim();
  if (!firstLine) {
    return "Failed to refresh rate limits.";
  }
  return firstLine.replace(/^Error:\s*/, "");
}

function getInitialCountdownTime(): number {
  return Date.now();
}

export const ModelUsagePopover = memo(function ModelUsagePopover({
  threadId,
  activities,
}: {
  threadId: ThreadId;
  activities: ReadonlyArray<OrchestrationThreadActivity>;
}) {
  const [refreshState, setRefreshState] = useState<{
    rateLimits: unknown;
    fetchedAt: string;
    cooldownExpiresAt: string;
    cached: boolean;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(getInitialCountdownTime);
  const autoRefreshThreadIdRef = useRef<ThreadId | null>(null);

  const entries = useMemo(
    () =>
      refreshState?.rateLimits
        ? getModelUsageFromRateLimits(refreshState.rateLimits)
        : getLatestModelUsage(activities),
    [activities, refreshState],
  );
  const snapshot = useMemo(
    () =>
      refreshState?.rateLimits
        ? getRateLimitSnapshot(refreshState.rateLimits)
        : getLatestRateLimitSnapshot(activities),
    [activities, refreshState],
  );
  const summary = summarizeRateLimitPair(snapshot);
  const latestFetchedAt = refreshState?.fetchedAt ?? null;
  const cooldownExpiresAt = refreshState?.cooldownExpiresAt ?? null;

  const refreshRateLimits = useCallback(
    async (options?: { silent?: boolean }) => {
      const api = readNativeApi();
      if (!api) return;
      setIsRefreshing(true);
      if (!options?.silent) {
        setRefreshError(null);
      }
      try {
        const result = await api.server.refreshRateLimits({ threadId });
        setRefreshState(result);
      } catch (error) {
        setRefreshError(formatRefreshError(error));
      } finally {
        setIsRefreshing(false);
      }
    },
    [threadId],
  );

  useEffect(() => {
    if (autoRefreshThreadIdRef.current === threadId) {
      return;
    }
    autoRefreshThreadIdRef.current = threadId;
    void refreshRateLimits({ silent: true });
  }, [refreshRateLimits, threadId]);

  useEffect(() => {
    const updateCountdown = () => {
      setCountdownNow(Date.now());
    };

    updateCountdown();
    const minuteMs = 60_000;
    const timeoutMs = minuteMs - (Date.now() % minuteMs);
    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      updateCountdown();
      intervalId = window.setInterval(updateCountdown, minuteMs);
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="xs" variant="outline" className="shrink-0 gap-1.5">
            <ChartNoAxesColumnIcon className="size-3.5" />
            <span>{`Limits: ${summary}`}</span>
          </Button>
        }
      />
      <PopoverPopup align="end" side="bottom" className="w-[min(25rem,calc(100vw-2rem))] p-0">
        <Card className="border-0 shadow-none before:hidden">
          <CardHeader className="border-b px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Rate limits</CardTitle>
                <CardDescription>
                  Usage windows from OpenAI for the current account.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {refreshState && (
                  <Badge variant={refreshState.cached ? "outline" : "info"} size="sm">
                    {refreshState.cached ? "Cached" : "Live"}
                  </Badge>
                )}
                <Button
                  size="xs"
                  variant="outline"
                  disabled={isRefreshing}
                  onClick={() => void refreshRateLimits()}
                >
                  <RefreshCcwIcon className={cn("size-3.5", isRefreshing && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-4 py-3">
            {(latestFetchedAt || refreshError) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/80 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {latestFetchedAt
                    ? `Last refreshed ${formatResetTime(latestFetchedAt) ?? latestFetchedAt}`
                    : "Refresh failed"}
                </span>
                {cooldownExpiresAt && (
                  <span>Next fetch {formatResetTime(cooldownExpiresAt) ?? cooldownExpiresAt}</span>
                )}
                {refreshError && (
                  <span className="max-w-full break-words text-destructive">{refreshError}</span>
                )}
              </div>
            )}
            {entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-4">
                <div className="text-sm font-medium text-foreground">No limit snapshot yet</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  OpenAI has not returned a 5h or weekly account snapshot yet.
                </div>
              </div>
            ) : (
              entries.map((entry) => {
                const resetTime = formatResetTime(entry.resetsAt);
                const resetCountdown = formatResetCountdown(entry.resetsAt, countdownNow);
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-border/80 bg-muted/15 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-foreground">
                            {entry.modelLabel}
                          </div>
                          <Badge variant="outline" size="sm">
                            {entry.windowLabel}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {entry.usedText && entry.limitText
                            ? `${entry.usedText} of ${entry.limitText} used`
                            : entry.remainingText
                              ? `${entry.remainingText} remaining`
                              : "Usage snapshot"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant={usageBadgeVariant(entry.usedPercent)} size="sm">
                          {formatUsagePercent(entry.usedPercent)}
                        </Badge>
                      </div>
                    </div>
                    {resetCountdown && (
                      <div className="mt-3">
                        <div className="text-sm font-semibold text-foreground">
                          {resetCountdown}
                        </div>
                        {resetTime && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {resetTime}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-200",
                          usageToneClassName(entry.usedPercent),
                        )}
                        style={{ width: `${entry.usedPercent ?? 0}%` }}
                      />
                    </div>
                    {(entry.remainingText || (resetTime && !resetCountdown)) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {entry.remainingText && <span>{entry.remainingText} remaining</span>}
                        {resetTime && !resetCountdown && <span>Resets {resetTime}</span>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </PopoverPopup>
    </Popover>
  );
});
