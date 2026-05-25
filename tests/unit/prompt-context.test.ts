import { afterEach, describe, expect, it, vi } from "vitest";
import type { Activity, ActivityRepository } from "../../src/lib/activity/types";
import {
  buildChatContext,
  serializeActivitiesForPrompt,
} from "../../src/lib/llm/context";
import { PROMPT_VERSION, buildAerisSystemPrompt } from "../../src/lib/llm/prompts";

const originalContextMonths = process.env.ACTIVITY_CONTEXT_MONTHS;
const now = new Date("2026-05-25T12:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();

  if (originalContextMonths === undefined) {
    delete process.env.ACTIVITY_CONTEXT_MONTHS;
  } else {
    process.env.ACTIVITY_CONTEXT_MONTHS = originalContextMonths;
  }
});

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "activity-1",
    activityDate: "2026-05-01T08:00:00.000Z",
    activityType: "Running",
    distanceKm: 10,
    durationSeconds: 3600,
    avgPaceSecPerKm: 360,
    avgHr: 145,
    maxHr: 170,
    calories: 700,
    ascentM: 40,
    vo2maxEstimate: 49,
    rawCsvRow: {},
    createdAt: "2026-05-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("chat context serialization", () => {
  it("serializes running activities into compact prompt keys", () => {
    const serialized = serializeActivitiesForPrompt(
      [
        activity({ activityDate: "2026-05-03T08:00:00.000Z", id: "later" }),
        activity({ activityDate: "2026-05-01T08:00:00.000Z", id: "earlier" }),
      ],
      { months: 12, now },
    );

    expect(serialized).toEqual([
      { d: "2026-05-01", pace: 360, hr: 145, dist: 10, vo2: 49 },
      { d: "2026-05-03", pace: 360, hr: 145, dist: 10, vo2: 49 },
    ]);
    expect(JSON.stringify(serialized)).not.toContain("activityDate");
  });

  it("filters context to running activities inside the configured window", async () => {
    process.env.ACTIVITY_CONTEXT_MONTHS = "6";
    const getRecentActivities = vi.fn().mockResolvedValue([
      activity({ activityDate: "2025-10-25T08:00:00.000Z", id: "old" }),
      activity({
        activityDate: "2026-05-20T08:00:00.000Z",
        activityType: "Cycling",
        id: "bike",
      }),
      activity({ activityDate: "2026-05-21T08:00:00.000Z", id: "run" }),
    ]);
    const repository = {
      getActivities: vi.fn().mockResolvedValue([]),
      getRecentActivities,
      insertActivities: vi.fn(),
    } satisfies ActivityRepository;

    const context = await buildChatContext({ repository, now });

    expect(getRecentActivities).toHaveBeenCalledWith({ months: 6, now });
    expect(context.contextWindowMonths).toBe(6);
    expect(context.activities).toEqual([
      { d: "2026-05-21", pace: 360, hr: 145, dist: 10, vo2: 49 },
    ]);
  });

  it("returns null efficiency snapshots when eligible data is sparse", async () => {
    const repository = {
      getActivities: vi.fn().mockResolvedValue([]),
      getRecentActivities: vi.fn().mockResolvedValue([
        activity({ avgHr: null }),
        activity({ distanceKm: 2.5 }),
      ]),
      insertActivities: vi.fn(),
    } satisfies ActivityRepository;

    const context = await buildChatContext({ repository, now });

    expect(context.efficiency).toEqual({
      current30d: null,
      previous90d: null,
      previous180d: null,
    });
  });

  it("computes current and prior efficiency snapshots from eligible runs", async () => {
    const repository = {
      getActivities: vi.fn().mockResolvedValue([]),
      getRecentActivities: vi.fn().mockResolvedValue([
        activity({
          activityDate: "2026-05-15T08:00:00.000Z",
          distanceKm: 10,
          durationSeconds: 3000,
          avgHr: 150,
        }),
        activity({
          activityDate: "2026-02-20T08:00:00.000Z",
          distanceKm: 9,
          durationSeconds: 3000,
          avgHr: 150,
        }),
        activity({
          activityDate: "2025-11-20T08:00:00.000Z",
          distanceKm: 8,
          durationSeconds: 3000,
          avgHr: 150,
        }),
      ]),
      insertActivities: vi.fn(),
    } satisfies ActivityRepository;

    const context = await buildChatContext({ repository, now });

    expect(context.efficiency.current30d).toBeCloseTo(0.0222, 4);
    expect(context.efficiency.previous90d).toBeCloseTo(0.02, 4);
    expect(context.efficiency.previous180d).toBeCloseTo(0.0178, 4);
  });
});

describe("Aeris prompt builder", () => {
  it("injects prompt version, compact context, and hallucination guardrails", () => {
    const prompt = buildAerisSystemPrompt({
      contextWindowMonths: 12,
      activityCount: 1,
      activities: [{ d: "2026-05-01", pace: 360, hr: 145, dist: 10, vo2: 49 }],
      activitiesJson: JSON.stringify([
        { d: "2026-05-01", pace: 360, hr: 145, dist: 10, vo2: 49 },
      ]),
      efficiency: {
        current30d: 0.0222,
        previous90d: 0.02,
        previous180d: null,
      },
    });

    expect(prompt).toContain(PROMPT_VERSION);
    expect(prompt).toContain("Answer using only the supplied running data");
    expect(prompt).toContain("Never invent statistics");
    expect(prompt).toContain("cite the relevant run dates or time periods");
    expect(prompt).toContain("Acknowledge uncertainty");
    expect(prompt).toContain("Do not provide coaching recommendations");
    expect(prompt).toContain("Do not create training plans");
    expect(prompt).toContain('"d":"2026-05-01"');
    expect(prompt).toContain("0.0222");
  });
});
