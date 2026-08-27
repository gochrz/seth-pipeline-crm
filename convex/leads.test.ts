import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

type NoteInput = {
  ts: number;
  text: string;
  auto: boolean;
};

type LeadInput = {
  name: string;
  email: string;
  phone: string;
  source: string;
  stage: "lead" | "qualified" | "downsell" | "closed" | "lost";
  offer: "" | "core" | "downsell";
  closer: "" | "Ben" | "Dylan" | "Seth";
  value: number;
  lastMeeting: string;
  nextMeeting: string;
  nextStep: string;
  notes: NoteInput[];
};

type LeadResult = LeadInput & {
  _id: string;
  _creationTime: number;
  createdAt: number;
  updatedAt: number;
};

const listRef = makeFunctionReference<
  "query",
  Record<string, never>,
  { leads: LeadResult[]; limited: boolean }
>("leads:list");

const saveRef = makeFunctionReference<
  "mutation",
  { leadId?: string; lead: LeadInput },
  string
>("leads:save");

const moveRef = makeFunctionReference<
  "mutation",
  { leadId: string; stage: LeadInput["stage"] },
  null
>("leads:move");

const removeRef = makeFunctionReference<
  "mutation",
  { leadId: string },
  null
>("leads:remove");

const importManyRef = makeFunctionReference<
  "mutation",
  { leads: LeadInput[] },
  string[]
>("leads:importMany");

const baseLead: LeadInput = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  source: "Referral",
  stage: "lead",
  offer: "core",
  closer: "Ben",
  value: 12500,
  lastMeeting: "",
  nextMeeting: "2026-09-01T10:00",
  nextStep: "Send proposal",
  notes: []
};

describe("leads backend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T15:00:00.000Z"));
  });

  it("returns an empty public board without authentication", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(listRef, {})).resolves.toEqual({
      leads: [],
      limited: false
    });
  });

  it("creates and updates a lead", async () => {
    const t = convexTest(schema, modules);
    const leadId = await t.mutation(saveRef, { lead: baseLead });

    let result = await t.query(listRef, {});
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      _id: leadId,
      name: "Ada Lovelace",
      value: 12500,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    vi.setSystemTime(new Date("2026-08-27T16:00:00.000Z"));
    await t.mutation(saveRef, {
      leadId,
      lead: { ...baseLead, name: "Ada Byron", stage: "qualified" }
    });

    result = await t.query(listRef, {});
    expect(result.leads[0]).toMatchObject({
      name: "Ada Byron",
      stage: "qualified",
      createdAt: new Date("2026-08-27T15:00:00.000Z").getTime(),
      updatedAt: new Date("2026-08-27T16:00:00.000Z").getTime()
    });
  });

  it("moves a lead and records the automatic history entry", async () => {
    const t = convexTest(schema, modules);
    const leadId = await t.mutation(saveRef, { lead: baseLead });

    vi.setSystemTime(new Date("2026-08-27T17:00:00.000Z"));
    await t.mutation(moveRef, { leadId, stage: "downsell" });

    const result = await t.query(listRef, {});
    expect(result.leads[0]).toMatchObject({
      stage: "downsell",
      offer: "downsell",
      updatedAt: Date.now()
    });
    expect(result.leads[0]?.notes.at(-1)).toEqual({
      ts: Date.now(),
      text: "Lead → Unqualified",
      auto: true
    });
  });

  it("deletes an existing lead", async () => {
    const t = convexTest(schema, modules);
    const leadId = await t.mutation(saveRef, { lead: baseLead });

    await t.mutation(removeRef, { leadId });

    await expect(t.query(listRef, {})).resolves.toEqual({
      leads: [],
      limited: false
    });
  });

  it("rejects updates and deletes for missing leads", async () => {
    const t = convexTest(schema, modules);
    const missingId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("leads", {
        ...baseLead,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      await ctx.db.delete("leads", id);
      return id;
    });

    await expect(
      t.mutation(saveRef, { leadId: missingId, lead: baseLead })
    ).rejects.toThrow("Lead not found");
    await expect(t.mutation(removeRef, { leadId: missingId })).rejects.toThrow(
      "Lead not found"
    );
  });

  it("rejects invalid text and oversized imports", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(saveRef, {
        lead: { ...baseLead, name: " ".repeat(121) }
      })
    ).rejects.toThrow("Give the lead a name first");
    await expect(
      t.mutation(importManyRef, {
        leads: Array.from({ length: 201 }, (_, index) => ({
          ...baseLead,
          name: `Lead ${index}`
        }))
      })
    ).rejects.toThrow("Import at most 200 leads at a time");
  });

  it("imports a valid batch transactionally", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.mutation(importManyRef, {
      leads: [baseLead, { ...baseLead, name: "Grace Hopper" }]
    });

    expect(ids).toHaveLength(2);
    const result = await t.query(listRef, {});
    expect(result.leads.map((lead) => lead.name).sort()).toEqual([
      "Ada Lovelace",
      "Grace Hopper"
    ]);
  });

  it("bounds the public list at one thousand leads", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await Promise.all(
        Array.from({ length: 1001 }, (_, index) =>
          ctx.db.insert("leads", {
            ...baseLead,
            name: `Lead ${index}`,
            createdAt: index,
            updatedAt: index
          })
        )
      );
    });

    const result = await t.query(listRef, {});
    expect(result.leads).toHaveLength(1000);
    expect(result.limited).toBe(true);
    expect(result.leads[0]?.name).toBe("Lead 1000");
  });
});
