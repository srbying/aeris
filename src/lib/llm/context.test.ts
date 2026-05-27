import { afterEach, describe, expect, it, vi } from "vitest";
import type { Activity, ActivityRepository } from "../activity/types";
import {
  buildChatContext,
  serializeActivitiesForPrompt,
} from "./context";
import { PROMPT_VERSION, buildAerisSystemPrompt } from "./prompts";

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

function noDrilldownIntent() {
  return {
    rawNumbers: false,
    olderRunReferences: false,
    detailedBreakdown: false,
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
      {
        d: "2026-05-01",
        pace: 360,
        paceText: "9:39 /mi",
        hr: 145,
        hrText: "145 bpm",
        dist: 10,
        distText: "6.2 mi",
        dur: 3600,
        durText: "1:00:00",
        asc: 40,
        ascText: "131 ft",
        vo2: 49,
        eff: 0.0192,
      },
      {
        d: "2026-05-03",
        pace: 360,
        paceText: "9:39 /mi",
        hr: 145,
        hrText: "145 bpm",
        dist: 10,
        distText: "6.2 mi",
        dur: 3600,
        durText: "1:00:00",
        asc: 40,
        ascText: "131 ft",
        vo2: 49,
        eff: 0.0192,
      },
    ]);
    expect(JSON.stringify(serialized)).not.toContain("activityDate");
  });

  it("serializes raw per-run aerobic efficiency when a run is eligible", () => {
    const serialized = serializeActivitiesForPrompt([activity()], {
      months: 12,
      now,
    });

    expect(serialized[0]).toEqual(
      expect.objectContaining({
        eff: 0.0192,
      }),
    );
  });

  it("serializes null raw per-run aerobic efficiency when a run is ineligible", () => {
    const serialized = serializeActivitiesForPrompt([activity({ avgHr: null })], {
      months: 12,
      now,
    });

    expect(serialized[0]).toEqual(
      expect.objectContaining({
        eff: null,
      }),
    );
  });

  it("serializes display fields in metric when requested", () => {
    const serialized = serializeActivitiesForPrompt([activity()], {
      months: 12,
      now,
      unitSystem: "metric",
    });

    expect(serialized[0]).toEqual(
      expect.objectContaining({
        pace: 360,
        paceText: "6:00 /km",
        dist: 10,
        distText: "10.0 km",
        asc: 40,
        ascText: "40 m",
      }),
    );
  });

  it("adds selected Garmin raw fields to compact prompt context when present", () => {
    const serialized = serializeActivitiesForPrompt(
      [
        activity({
          rawCsvRow: {
            Title: "Avon Lake - W03D7-Long Run",
            "Moving Time": "01:20:01",
            "Elapsed Time": "01:20:04",
          },
        }),
      ],
      { months: 12, now },
    );

    expect(serialized).toEqual([
      {
        d: "2026-05-01",
        pace: 360,
        paceText: "9:39 /mi",
        hr: 145,
        hrText: "145 bpm",
        dist: 10,
        distText: "6.2 mi",
        dur: 3600,
        durText: "1:00:00",
        asc: 40,
        ascText: "131 ft",
        vo2: 49,
        eff: 0.0192,
        title: "Avon Lake - W03D7-Long Run",
        moving: 4801,
        elapsed: 4804,
      },
    ]);
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
      {
        d: "2026-05-21",
        pace: 360,
        paceText: "9:39 /mi",
        hr: 145,
        hrText: "145 bpm",
        dist: 10,
        distText: "6.2 mi",
        dur: 3600,
        durText: "1:00:00",
        asc: 40,
        ascText: "131 ft",
        vo2: 49,
        eff: 0.0192,
      },
    ]);
  });

  it("computes comparison facts for two explicit run dates in the user question", async () => {
    const repository = {
      getActivities: vi.fn().mockResolvedValue([]),
      getRecentActivities: vi.fn().mockResolvedValue([
        activity({
          activityDate: "2026-05-09T08:00:00.000Z",
          distanceKm: 18.13,
          durationSeconds: 4573,
          avgPaceSecPerKm: 252,
          avgHr: 146,
          ascentM: 21,
        }),
        activity({
          activityDate: "2026-05-17T08:00:00.000Z",
          distanceKm: 17.87,
          durationSeconds: 4804,
          avgPaceSecPerKm: 269,
          avgHr: 148,
          ascentM: 27,
        }),
      ]),
      insertActivities: vi.fn(),
    } satisfies ActivityRepository;

    const context = await buildChatContext({
      repository,
      now,
      question:
        "on May 17, 2026 I ran longer, but less distance compared to my run on May 9, 2026. Explain why",
    });

    expect(context.dateComparisonFacts).toEqual({
      focus: {
        d: "2026-05-17",
        dist: 17.87,
        distText: "11.1 mi",
        dur: 4804,
        durText: "1:20:04",
        pace: 269,
        paceText: "7:13 /mi",
        hr: 148,
        hrText: "148 bpm",
        asc: 27,
        ascText: "89 ft",
      },
      baseline: {
        d: "2026-05-09",
        dist: 18.13,
        distText: "11.3 mi",
        dur: 4573,
        durText: "1:16:13",
        pace: 252,
        paceText: "6:46 /mi",
        hr: 146,
        hrText: "146 bpm",
        asc: 21,
        ascText: "69 ft",
      },
      delta: { dist: -0.26, dur: 231, pace: 17, hr: 2, asc: 6 },
      deltaText: {
        dist: "-0.2 mi",
        dur: "+3:51",
        pace: "+0:27 /mi",
        hr: "+2 bpm",
        asc: "+20 ft",
      },
      explanationHint:
        "2026-05-17 took longer despite less distance because average pace was slower.",
    });
    expect(context.dateComparisonFactsJson).toContain('"dur":4804');
    expect(context.dateComparisonFactsJson).toContain('"durText":"1:20:04"');
    expect(context.dateComparisonFactsJson).toContain('"paceText":"7:13 /mi"');
  });

  it("detects raw-number and older-run drilldown intent from follow-up wording", async () => {
    const repository = {
      getActivities: vi.fn().mockResolvedValue([]),
      getRecentActivities: vi.fn().mockResolvedValue([activity()]),
      insertActivities: vi.fn(),
    } satisfies ActivityRepository;

    const context = await buildChatContext({
      repository,
      now,
      question: "Show the raw numbers, older run references, and detailed breakdown behind that.",
      history: [
        {
          role: "assistant",
          content: "Directionally yes: recent similar-HR runs look faster than older ones.",
        },
      ],
    });

    expect(context.drilldownIntent).toEqual({
      rawNumbers: true,
      olderRunReferences: true,
      detailedBreakdown: true,
    });
  });

  it.each([
    ["May 17 2026 vs May 9 2026"],
    ["2026-05-17 vs 2026-05-09"],
    ["5/17/2026 vs 5/9/2026"],
  ])("computes comparison facts from common date format: %s", async (question) => {
    const repository = {
      getActivities: vi.fn().mockResolvedValue([]),
      getRecentActivities: vi.fn().mockResolvedValue([
        activity({
          activityDate: "2026-05-09T08:00:00.000Z",
          distanceKm: 18.13,
          durationSeconds: 4573,
          avgPaceSecPerKm: 252,
        }),
        activity({
          activityDate: "2026-05-17T08:00:00.000Z",
          distanceKm: 17.87,
          durationSeconds: 4804,
          avgPaceSecPerKm: 269,
        }),
      ]),
      insertActivities: vi.fn(),
    } satisfies ActivityRepository;

    const context = await buildChatContext({ repository, now, question });

    expect(context.dateComparisonFacts?.focus.d).toBe("2026-05-17");
    expect(context.dateComparisonFacts?.baseline.d).toBe("2026-05-09");
    expect(context.dateComparisonFacts?.delta.dur).toBe(231);
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
    expect(context.efficiencyDisplay).toEqual({
      currentVsPrevious90d: "+11.0% speed per heartbeat",
      currentVsPrevious180d: "+24.7% speed per heartbeat",
    });
  });
});

describe("Aeris prompt builder", () => {
  it("injects prompt version, compact context, and hallucination guardrails", () => {
    const prompt = buildAerisSystemPrompt({
      contextWindowMonths: 12,
      activityCount: 1,
      displayUnitSystem: "imperial",
      activities: [
        {
          d: "2026-05-01",
          pace: 360,
          paceText: "9:39 /mi",
          hr: 145,
          hrText: "145 bpm",
          dist: 10,
          distText: "6.2 mi",
          dur: 3600,
          durText: "1:00:00",
          asc: 40,
          ascText: "131 ft",
          vo2: 49,
          eff: 0.0192,
        },
      ],
      activitiesJson: JSON.stringify([
        {
          d: "2026-05-01",
          pace: 360,
          paceText: "9:39 /mi",
          hr: 145,
          hrText: "145 bpm",
          dist: 10,
          distText: "6.2 mi",
          dur: 3600,
          durText: "1:00:00",
          asc: 40,
          ascText: "131 ft",
          vo2: 49,
          eff: 0.0192,
        },
      ]),
      dateComparisonFacts: {
        focus: {
          d: "2026-05-17",
          dist: 17.87,
          distText: "11.1 mi",
          dur: 4804,
          durText: "1:20:04",
          pace: 269,
          paceText: "7:13 /mi",
          hr: 148,
          hrText: "148 bpm",
          asc: 27,
          ascText: "89 ft",
        },
        baseline: {
          d: "2026-05-09",
          dist: 18.13,
          distText: "11.3 mi",
          dur: 4573,
          durText: "1:16:13",
          pace: 252,
          paceText: "6:46 /mi",
          hr: 146,
          hrText: "146 bpm",
          asc: 21,
          ascText: "69 ft",
        },
        delta: { dist: -0.26, dur: 231, pace: 17, hr: 2, asc: 6 },
        deltaText: {
          dist: "-0.2 mi",
          dur: "+3:51",
          pace: "+0:27 /mi",
          hr: "+2 bpm",
          asc: "+20 ft",
        },
        explanationHint:
          "2026-05-17 took longer despite less distance because average pace was slower.",
      },
      dateComparisonFactsJson: JSON.stringify({
        focus: { d: "2026-05-17", dist: 17.87, dur: 4804, pace: 269, hr: 148, asc: 27 },
        baseline: { d: "2026-05-09", dist: 18.13, dur: 4573, pace: 252, hr: 146, asc: 21 },
        delta: { dist: -0.26, dur: 231, pace: 17, hr: 2, asc: 6 },
        deltaText: {
          dist: "-0.2 mi",
          dur: "+3:51",
          pace: "+0:27 /mi",
          hr: "+2 bpm",
          asc: "+20 ft",
        },
        explanationHint:
          "2026-05-17 took longer despite less distance because average pace was slower.",
      }),
      efficiency: {
        current30d: 0.0222,
        previous90d: 0.02,
        previous180d: null,
      },
      efficiencyDisplay: {
        currentVsPrevious90d: "+11.0% speed per heartbeat",
        currentVsPrevious180d: null,
      },
      drilldownIntent: noDrilldownIntent(),
    });

    expect(prompt).toContain(PROMPT_VERSION);
    expect(prompt).toContain("Answer using only the supplied running data");
    expect(prompt).toContain("Never invent statistics");
    expect(prompt).toContain("cite the relevant run dates or time periods");
    expect(prompt).toContain("Acknowledge uncertainty");
    expect(prompt).toContain("Do not provide coaching recommendations");
    expect(prompt).toContain("Do not create training plans");
    expect(prompt).toContain('"d":"2026-05-01"');
    expect(prompt).toContain('"paceText":"9:39 /mi"');
    expect(prompt).toContain("Date comparison facts compact JSON");
    expect(prompt).toContain("longer despite less distance");
    expect(prompt).toContain("0.0222");
    expect(prompt).toContain("Default display unit system: imperial");
    expect(prompt).toContain("verdict first");
    expect(prompt).toContain("meaning before raw formulas");
    expect(prompt).toContain("light chat Markdown");
    expect(prompt).toContain("Do not show raw aerobic efficiency decimals by default");
    expect(prompt).toContain("Use similar heart rate, not same effort");
    expect(prompt).toContain("pretty clear");
    expect(prompt).toContain("directionally yes");
    expect(prompt).toContain("mixed");
    expect(prompt).toContain("too noisy to call");
    expect(prompt).toContain("No tables unless the user asks");
  });

  it("injects follow-up drilldown rules without weakening first-pass summaries", () => {
    const prompt = buildAerisSystemPrompt({
      contextWindowMonths: 12,
      activityCount: 1,
      displayUnitSystem: "imperial",
      activities: [],
      activitiesJson: JSON.stringify([
        {
          d: "2026-05-01",
          pace: 360,
          paceText: "9:39 /mi",
          hr: 145,
          hrText: "145 bpm",
          dist: 10,
          distText: "6.2 mi",
          dur: 3600,
          durText: "1:00:00",
          asc: 40,
          ascText: "131 ft",
          vo2: 49,
          eff: 0.0192,
        },
      ]),
      dateComparisonFacts: null,
      dateComparisonFactsJson: "null",
      efficiency: {
        current30d: 0.0192,
        previous90d: null,
        previous180d: null,
      },
      efficiencyDisplay: {
        currentVsPrevious90d: null,
        currentVsPrevious180d: null,
      },
      drilldownIntent: {
        rawNumbers: true,
        olderRunReferences: true,
        detailedBreakdown: true,
      },
    });

    expect(PROMPT_VERSION).toBe("v1.3");
    expect(prompt).toContain("Normal first-pass answers stay pattern-first");
    expect(prompt).toContain("Raw-number drilldown requested: true");
    expect(prompt).toContain("Older-run reference drilldown requested: true");
    expect(prompt).toContain("Detailed breakdown requested: true");
    expect(prompt).toContain("preserve exact run dates");
    expect(prompt).toContain("resolve short follow-ups");
    expect(prompt).toContain("may use compact tables");
  });

  it("spells out the flagship same-heart-rate answer contract", () => {
    const prompt = buildAerisSystemPrompt({
      contextWindowMonths: 12,
      activityCount: 4,
      displayUnitSystem: "imperial",
      activities: [],
      activitiesJson: JSON.stringify([
        {
          d: "2026-02-20",
          paceText: "9:39 /mi",
          hrText: "145 bpm",
          distText: "6.2 mi",
        },
        {
          d: "2026-05-20",
          paceText: "8:51 /mi",
          hrText: "146 bpm",
          distText: "6.2 mi",
        },
      ]),
      dateComparisonFacts: null,
      dateComparisonFactsJson: "null",
      efficiency: {
        current30d: 0.0202,
        previous90d: 0.0185,
        previous180d: null,
      },
      efficiencyDisplay: {
        currentVsPrevious90d: "+9.2% speed per heartbeat",
        currentVsPrevious180d: null,
      },
      drilldownIntent: noDrilldownIntent(),
    });

    expect(PROMPT_VERSION).toBe("v1.3");
    expect(prompt).toContain(
      'For same-heart-rate trend questions like "Am I getting faster at the same heart rate?"',
    );
    expect(prompt).toContain("lead with a direct plain-language verdict");
    expect(prompt).toContain(
      "summarize the relevant pattern before listing individual run examples",
    );
    expect(prompt).toContain("cite only the smallest useful set of key runs");
    expect(prompt).toContain("more speed for a similar heart-rate cost");
    expect(prompt).toContain("pretty clear");
    expect(prompt).toContain("directionally yes");
    expect(prompt).toContain("mixed");
    expect(prompt).toContain("too noisy to call");
    expect(prompt).toContain(
      "say when the data is insufficient instead of manufacturing certainty",
    );
    expect(prompt).toContain("Do not provide coaching recommendations");
    expect(prompt).toContain("Do not create training plans");
  });
});
