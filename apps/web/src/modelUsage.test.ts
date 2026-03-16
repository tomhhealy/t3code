import { EventId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  formatRateLimitPercent,
  formatResetCountdown,
  getLatestRateLimitSnapshot,
  getLatestTokenUsage,
  getContextWindowUsage,
  getRateLimitSnapshot,
  summarizeRateLimitPair,
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
        resetsAt: "2026-03-16T19:49:27.000Z",
      },
      secondary: {
        label: "Weekly Limit",
        usedPercent: 22,
        windowDurationMins: 10080,
        resetsAt: "2026-03-19T13:29:23.000Z",
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
    expect(summarizeRateLimitPair(snapshot)).toBe("42% / 65%");
  });

  it("reads limits arrays from codex snapshots", () => {
    const snapshot = getRateLimitSnapshot({
      limits: [
        { model: "codex", window: "5h", used: 80, limit: 80, resetsAt: 1773690000 },
        { model: "codex", window: "weekly", used: 75, limit: 100, resetsAt: 1773920000 },
      ],
    });

    expect(snapshot?.primary?.usedPercent).toBe(100);
    expect(snapshot?.secondary?.usedPercent).toBe(75);
    expect(summarizeRateLimitPair(snapshot)).toBe("100% / 75%");
  });

  it("formats reset countdowns with day, hour, and minute granularity", () => {
    const now = new Date("2026-03-16T10:00:00Z").getTime();

    expect(formatResetCountdown("2026-03-19T13:00:00Z", now)).toBe("Resets in 4 days");
    expect(formatResetCountdown("2026-03-17T20:00:00Z", now)).toBe("Resets in 34 hours");
    expect(formatResetCountdown("2026-03-16T10:45:00Z", now)).toBe("Resets in 45 min");
    expect(formatResetCountdown("2026-03-16T10:00:30Z", now)).toBe("Resets now");
  });

  it("extracts token usage and context usage", () => {
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
    expect(formatRateLimitPercent(null)).toBe("--");
    expect(getContextWindowUsage(usage)).toMatchObject({
      totalTokens: 15756,
      modelContextWindow: 258400,
    });
  });

  it("supports snake_case token usage payloads", () => {
    const usage = getLatestTokenUsage([
      {
        id: EventId.makeUnsafe("activity-2"),
        tone: "info",
        kind: "thread.token-usage.updated",
        summary: "Token usage updated",
        payload: {
          usage: {
            tokenUsage: {
              total: {
                total_tokens: 1200,
                input_tokens: 1000,
                cached_input_tokens: 250,
                output_tokens: 200,
                reasoning_output_tokens: 50,
              },
              model_context_window: 2000,
            },
          },
        },
        turnId: null,
        createdAt: "2026-03-16T10:00:00Z",
      },
    ]);

    expect(usage).toMatchObject({
      totalTokens: 1200,
      inputTokens: 1000,
      cachedInputTokens: 250,
      outputTokens: 200,
      reasoningOutputTokens: 50,
      modelContextWindow: 2000,
    });
  });

  it("prefers last_token_usage over cumulative total_token_usage for context", () => {
    const usage = getLatestTokenUsage([
      {
        id: EventId.makeUnsafe("activity-4"),
        tone: "info",
        kind: "thread.token-usage.updated",
        summary: "Token usage updated",
        payload: {
          usage: {
            info: {
              total_token_usage: {
                total_tokens: 8_544_254,
                input_tokens: 8_524_758,
                cached_input_tokens: 8_117_760,
                output_tokens: 19_496,
              },
              last_token_usage: {
                total_tokens: 215_026,
                input_tokens: 214_856,
                cached_input_tokens: 200_960,
                output_tokens: 170,
                reasoning_output_tokens: 82,
              },
              model_context_window: 258_400,
            },
          },
        },
        turnId: null,
        createdAt: "2026-03-16T10:00:00Z",
      },
    ]);

    expect(usage).toMatchObject({
      totalTokens: 215_026,
      inputTokens: 214_856,
      cachedInputTokens: 200_960,
      outputTokens: 170,
      reasoningOutputTokens: 82,
      modelContextWindow: 258_400,
    });
    expect(getContextWindowUsage(usage)).toMatchObject({
      totalTokens: 215_026,
      modelContextWindow: 258_400,
    });
  });

  it("derives context usage when totalTokens is omitted", () => {
    const usage = getLatestTokenUsage([
      {
        id: EventId.makeUnsafe("activity-3"),
        tone: "info",
        kind: "thread.token-usage.updated",
        summary: "Token usage updated",
        payload: {
          usage: {
            tokenUsage: {
              inputTokens: 50000,
              cachedInputTokens: 25000,
              outputTokens: 4000,
              modelContextWindow: 258000,
            },
          },
        },
        turnId: null,
        createdAt: "2026-03-16T10:00:00Z",
      },
    ]);

    expect(getContextWindowUsage(usage)).toMatchObject({
      totalTokens: 79000,
      modelContextWindow: 258000,
    });
  });
});
