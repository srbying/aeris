import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("activities table migration", () => {
  it("creates the activities table with the required deduplication index", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/0001_create_activities.sql"),
      "utf8",
    );

    expect(sql).toMatch(/create table if not exists public\.activities/i);
    expect(sql).toMatch(/activity_date\s+timestamptz\s+not null/i);
    expect(sql).toMatch(/activity_type\s+text\s+not null/i);
    expect(sql).toMatch(/distance_km\s+numeric\s+not null/i);
    expect(sql).toMatch(/duration_seconds\s+integer\s+not null/i);
    expect(sql).toMatch(/raw_csv_row\s+jsonb\s+not null/i);
    expect(sql).toMatch(/unique index[\s\S]*activity_date[\s\S]*activity_type[\s\S]*distance_km/i);
  });
});
