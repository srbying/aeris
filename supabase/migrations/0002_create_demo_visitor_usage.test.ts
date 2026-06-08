import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("demo visitor usage migration", () => {
  it("creates durable usage storage and atomic turn consumption RPC", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/0002_create_demo_visitor_usage.sql"),
      "utf8",
    );

    expect(sql).toMatch(/create table if not exists public\.demo_visitor_usage/i);
    expect(sql).toMatch(/visitor_key_hash\s+text\s+primary key/i);
    expect(sql).toMatch(/turns_used\s+integer\s+not null\s+default 0/i);
    expect(sql).toMatch(/check\s*\(\s*turns_used\s*>=\s*0\s*\)/i);
    expect(sql).toMatch(/first_seen_at\s+timestamptz\s+not null\s+default now\(\)/i);
    expect(sql).toMatch(/last_seen_at\s+timestamptz\s+not null\s+default now\(\)/i);
    expect(sql).toMatch(/alter table public\.demo_visitor_usage enable row level security/i);
    expect(sql).toMatch(/create or replace function public\.consume_demo_chat_turn/i);
    expect(sql).toMatch(/p_visitor_key_hash\s+text/i);
    expect(sql).toMatch(/p_limit\s+integer/i);
    expect(sql).toMatch(/on conflict\s*\(\s*visitor_key_hash\s*\)\s*do update/i);
  });
});
