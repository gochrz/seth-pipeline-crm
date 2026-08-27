import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

type BookingInput = {
  kind: "created" | "canceled";
  expectedEventTypeUri: string;
  eventTypeUri: string;
  inviteeUri: string;
  scheduledEventUri: string;
  name: string;
  email: string;
  phone: string;
  startTime: string;
  rescheduled: boolean;
  oldInviteeUri?: string;
};

type SyncResult = {
  outcome: "created" | "updated" | "canceled" | "unchanged" | "ignored";
  leadId?: string;
};

const syncBookingRef = makeFunctionReference<
  "mutation",
  BookingInput,
  SyncResult
>("calendly:syncBooking");

const listRef = makeFunctionReference<
  "query",
  Record<string, never>,
  {
    leads: Array<{
      _id: string;
      name: string;
      email: string;
      phone: string;
      source: string;
      stage: string;
      offer: string;
      closer: string;
      value: number;
      lastMeeting: string;
      nextMeeting: string;
      nextStep: string;
      notes: Array<{ ts: number; text: string; auto: boolean }>;
      createdAt: number;
      updatedAt: number;
    }>;
    limited: boolean;
  }
>("leads:list");

const eventTypeUri = "https://api.calendly.com/event_types/caslin-intro";

const booking: BookingInput = {
  kind: "created",
  expectedEventTypeUri: eventTypeUri,
  eventTypeUri,
  inviteeUri:
    "https://api.calendly.com/scheduled_events/event-1/invitees/invitee-1",
  scheduledEventUri: "https://api.calendly.com/scheduled_events/event-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+15550100",
  startTime: "2026-09-01T14:00:00.000Z",
  rescheduled: false
};

describe("Calendly booking sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T15:00:00.000Z"));
  });

  it("creates a lead for the configured Calendly event", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(syncBookingRef, booking);
    const pipeline = await t.query(listRef, {});

    expect(result.outcome).toBe("created");
    expect(pipeline.leads).toHaveLength(1);
    expect(pipeline.leads[0]).toMatchObject({
      _id: result.leadId,
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+15550100",
      source: "Calendly",
      stage: "lead",
      offer: "core",
      closer: "Ben",
      value: 0,
      lastMeeting: "",
      nextMeeting: "2026-09-01T14:00:00.000Z",
      nextStep: "Attend intro call",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });

  it("does not duplicate a repeated booking notification", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(syncBookingRef, booking);

    vi.setSystemTime(new Date("2026-08-27T16:00:00.000Z"));
    const repeated = await t.mutation(syncBookingRef, booking);
    const pipeline = await t.query(listRef, {});
    const mappings = await t.run(async (ctx) => {
      return await ctx.db.query("calendlyBookings").collect();
    });

    expect(repeated).toEqual({ outcome: "unchanged", leadId: first.leadId });
    expect(pipeline.leads).toHaveLength(1);
    expect(pipeline.leads[0]?.updatedAt).toBe(
      new Date("2026-08-27T15:00:00.000Z").getTime()
    );
    expect(mappings).toHaveLength(1);
  });

  it("ignores bookings from other Calendly event types", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(syncBookingRef, {
      ...booking,
      eventTypeUri: "https://api.calendly.com/event_types/another-event"
    });
    const pipeline = await t.query(listRef, {});

    expect(result).toEqual({ outcome: "ignored" });
    expect(pipeline.leads).toHaveLength(0);
  });

  it("keeps the lead and clears the meeting when a booking is canceled", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(syncBookingRef, booking);

    vi.setSystemTime(new Date("2026-08-27T16:00:00.000Z"));
    const canceled = await t.mutation(syncBookingRef, {
      ...booking,
      kind: "canceled"
    });
    const pipeline = await t.query(listRef, {});
    const mappings = await t.run(async (ctx) => {
      return await ctx.db.query("calendlyBookings").collect();
    });

    expect(canceled).toEqual({ outcome: "canceled", leadId: created.leadId });
    expect(pipeline.leads).toHaveLength(1);
    expect(pipeline.leads[0]).toMatchObject({
      nextMeeting: "",
      updatedAt: Date.now()
    });
    expect(pipeline.leads[0]?.notes.at(-1)).toEqual({
      ts: Date.now(),
      text: "Calendly booking canceled",
      auto: true
    });
    expect(mappings[0]?.status).toBe("canceled");
  });

  it("does not repeat cancellation history", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(syncBookingRef, booking);
    await t.mutation(syncBookingRef, { ...booking, kind: "canceled" });

    vi.setSystemTime(new Date("2026-08-27T17:00:00.000Z"));
    const repeated = await t.mutation(syncBookingRef, {
      ...booking,
      kind: "canceled"
    });
    const pipeline = await t.query(listRef, {});

    expect(repeated).toEqual({ outcome: "unchanged", leadId: created.leadId });
    expect(pipeline.leads[0]?.notes).toHaveLength(1);
  });

  it("updates the same lead when Calendly reschedules", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(syncBookingRef, booking);
    const newBooking: BookingInput = {
      ...booking,
      inviteeUri:
        "https://api.calendly.com/scheduled_events/event-2/invitees/invitee-2",
      scheduledEventUri: "https://api.calendly.com/scheduled_events/event-2",
      startTime: "2026-09-03T16:30:00.000Z",
      rescheduled: true,
      oldInviteeUri: booking.inviteeUri
    };

    vi.setSystemTime(new Date("2026-08-27T16:00:00.000Z"));
    const rescheduled = await t.mutation(syncBookingRef, newBooking);
    await t.mutation(syncBookingRef, {
      ...booking,
      kind: "canceled",
      rescheduled: true
    });
    const pipeline = await t.query(listRef, {});
    const mappings = await t.run(async (ctx) => {
      return await ctx.db.query("calendlyBookings").collect();
    });

    expect(rescheduled).toEqual({ outcome: "updated", leadId: created.leadId });
    expect(pipeline.leads).toHaveLength(1);
    expect(pipeline.leads[0]).toMatchObject({
      _id: created.leadId,
      nextMeeting: "2026-09-03T16:30:00.000Z",
      updatedAt: Date.now()
    });
    expect(pipeline.leads[0]?.notes.at(-1)).toEqual({
      ts: Date.now(),
      text: "Calendly booking rescheduled",
      auto: true
    });
    expect(mappings).toHaveLength(2);
    expect(
      mappings.find((mapping) => mapping.inviteeUri === booking.inviteeUri)
        ?.status
    ).toBe("canceled");
    expect(
      mappings.find((mapping) => mapping.inviteeUri === newBooking.inviteeUri)
        ?.status
    ).toBe("active");
  });
});
