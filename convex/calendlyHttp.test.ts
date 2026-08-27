import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

const eventTypeUri = "https://api.calendly.com/event_types/caslin-intro";
const scheduledEventUri =
  "https://api.calendly.com/scheduled_events/event-1";
const inviteeUri = `${scheduledEventUri}/invitees/invitee-1`;

const createdPayload = {
  event: "invitee.created",
  payload: {
    uri: inviteeUri,
    event: scheduledEventUri,
    name: "Ada Lovelace",
    email: "ada@example.com",
    text_reminder_number: "+15550100",
    status: "active",
    rescheduled: false,
    old_invitee: null
  }
};

describe("Calendly HTTP webhook", () => {
  beforeEach(() => {
    vi.stubEnv("CALENDLY_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("CALENDLY_WEBHOOK_SECRET", "test-webhook-secret");
    vi.stubEnv(
      "CALENDLY_EVENT_TYPE_URI",
      eventTypeUri
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects an incorrect callback secret", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/webhooks/calendly?secret=wrong", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("fails closed when Calendly production settings are missing", async () => {
    vi.stubEnv("CALENDLY_ACCESS_TOKEN", "");
    const t = convexTest(schema, modules);

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe(
      "Calendly webhook is not configured"
    );
  });

  it("rejects malformed webhook payloads", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json"
      }
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid Calendly payload");
  });

  it("rejects webhook payloads with missing booking fields", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid Calendly payload");
  });

  it("rejects a booking without an invitee name", async () => {
    const calendlyFetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", calendlyFetch);
    const t = convexTest(schema, modules);

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createdPayload,
          payload: { ...createdPayload.payload, name: "   " }
        })
      }
    );

    expect(response.status).toBe(400);
    expect(calendlyFetch).not.toHaveBeenCalled();
  });

  it("rejects event lookups outside the Calendly API", async () => {
    const calendlyFetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", calendlyFetch);
    const t = convexTest(schema, modules);

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createdPayload,
          payload: {
            ...createdPayload.payload,
            event: "https://example.com/scheduled_events/event-1"
          }
        })
      }
    );

    expect(response.status).toBe(400);
    expect(calendlyFetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid Calendly event response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
    const t = convexTest(schema, modules);

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createdPayload)
      }
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toBe("Invalid Calendly event");
  });

  it("creates a pipeline lead from an authoritative Calendly booking", async () => {
    const calendlyFetch = vi.fn(async () => {
      return Response.json({
        resource: {
          uri: scheduledEventUri,
          name: "Caslin Partner Intro Call",
          status: "active",
          start_time: "2026-09-01T14:00:00.000Z",
          event_type: eventTypeUri
        }
      });
    });
    vi.stubGlobal("fetch", calendlyFetch);
    const t = convexTest(schema, modules);

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createdPayload)
      }
    );
    const leads = await t.run(async (ctx) => {
      return await ctx.db.query("leads").collect();
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "created"
    });
    expect(calendlyFetch).toHaveBeenCalledWith(scheduledEventUri, {
      headers: { authorization: "Bearer test-access-token" }
    });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+15550100",
      nextMeeting: "2026-09-01T14:00:00.000Z"
    });
  });

  it("normalizes Calendly invitee contact fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          resource: {
            event_type: eventTypeUri,
            start_time: "2026-09-01T14:00:00.000Z"
          }
        })
      )
    );
    const t = convexTest(schema, modules);

    await t.fetch("/webhooks/calendly?secret=test-webhook-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...createdPayload,
        payload: {
          ...createdPayload.payload,
          name: "  Ada Lovelace  ",
          email: "  ada@example.com  ",
          text_reminder_number: "  +15550100  "
        }
      })
    });
    const leads = await t.run(async (ctx) => {
      return await ctx.db.query("leads").collect();
    });

    expect(leads[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+15550100"
    });
  });

  it("applies Calendly cancellation notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          resource: {
            event_type: eventTypeUri,
            start_time: "2026-09-01T14:00:00.000Z"
          }
        })
      )
    );
    const t = convexTest(schema, modules);
    await t.fetch("/webhooks/calendly?secret=test-webhook-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createdPayload)
    });

    const response = await t.fetch(
      "/webhooks/calendly?secret=test-webhook-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createdPayload,
          event: "invitee.canceled",
          payload: {
            ...createdPayload.payload,
            status: "canceled"
          }
        })
      }
    );
    const leads = await t.run(async (ctx) => {
      return await ctx.db.query("leads").collect();
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "canceled"
    });
    expect(leads).toHaveLength(1);
    expect(leads[0]?.nextMeeting).toBe("");
    expect(leads[0]?.notes.at(-1)?.text).toBe("Calendly booking canceled");
  });
});
