import { EventId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  getLatestRateLimitSnapshot,
  getLatestTokenUsage,
  getRateLimitSnapshot,
  summarizeRateLimitSnapshot,
} from "./modelUsage";

describe("modelUsage", () => {
  it("maps primary and secondary windows to 5 hour and weekly limits", () => {
    const snapshot = getRateLimitSnapshot({
      limitId: "codex",
      planType: "plus",
      primary: { usedPercent: 52, windowDurationMins: 300, resetsAt: 1773690567 },
      secondary: { usedPercent: 22, windowDurationMins: 10080, resetsAt: 1773926963 },
    });

    expect(snapshot).toMatchObject({
      limitId: "codex",
      planType: "plus",
      primary: {
        label: "5 Hour Limit",
        usedPercent: 52,
        windowDurationMins: 300,
        resetsAt: "2026-03-16T19:22:47.000Z",
      },
      secondary: {
        label: "Weekly Limit",
        usedPercent: 22,
        windowDurationMins: 10080,
        resetsAt: "2026-03-19T13:02:43.000Z",
      },
    });
  });

  it("reads the latest rate limit activity", () => {
    const snapshot = getLatestRateLimitSnapshot([
      {
        id: EventId.makeUnsafe("activity-1"),
        tone: "info",
        kind: "account.rate-limits.updated",
        summary: "Model usage limits updated",
        payload: {
          rateLimits: {
            primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1773690000 },
            secondary: { usedPercent: 65, windowDurationMins: 10080, resetsAt: 1773920000 },
          },
        },
        turnId: null,
        createdAt: "2026-03-16T10:00:00Z",
      },
    ]);

    expect(snapshot?.primary?.label).toBe("5 Hour Limit");
    expect(snapshot?.secondary?.label).toBe("Weekly Limit");
    expect(summarizeRateLimitSnapshot(snapshot)).toBe("65%");
  });

  it("extracts token usage when no rate-limit snapshot exists", () => {
    const usage = getLatestTokenUsage([
      {
        id: EventId.makeUnsafe("activity-1"),
        tone: "info",
        kind: "thread.token-usage.updated",
        summary: "Token usage updated",
        payload: {
          usage: {
            tokenUsage: {
              total: {
                totalTokens: 15756,
                inputTokens: 15739,
                cachedInputTokens: 2432,
                outputTokens: 17,
                reasoningOutputTokens: 10,
              },
              modelContextWindow: 258400,
            },
          },
        },
        turnId: null,
        createdAt: "2026-03-16T10:00:00Z",
      },
    ]);

    expect(usage).toMatchObject({
      totalTokens: 15756,
      inputTokens: 15739,
      cachedInputTokens: 2432,
      outputTokens: 17,
      reasoningOutputTokens: 10,
      modelContextWindow: 258400,
    });
  });
});
