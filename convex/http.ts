import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

type CalendlyWebhook = {
  event: "invitee.created" | "invitee.canceled";
  payload: {
    uri: string;
    event: string;
    name: string;
    email: string;
    text_reminder_number?: string | null;
    rescheduled: boolean;
    old_invitee?: string | null;
  };
};

type CalendlyEventResult = {
  resource: {
    event_type: string;
    start_time: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCalendlyApiUri(value: string, path: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://api.calendly.com" && url.pathname.startsWith(path)
    );
  } catch {
    return false;
  }
}

function isCalendlyWebhook(value: unknown): value is CalendlyWebhook {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  const payload = value.payload;
  return (
    (value.event === "invitee.created" ||
      value.event === "invitee.canceled") &&
    typeof payload.uri === "string" &&
    isCalendlyApiUri(payload.uri, "/scheduled_events/") &&
    typeof payload.event === "string" &&
    isCalendlyApiUri(payload.event, "/scheduled_events/") &&
    typeof payload.name === "string" &&
    payload.name.trim().length > 0 &&
    payload.name.length <= 120 &&
    typeof payload.email === "string" &&
    typeof payload.rescheduled === "boolean" &&
    (payload.text_reminder_number === undefined ||
      payload.text_reminder_number === null ||
      typeof payload.text_reminder_number === "string") &&
    (payload.old_invitee === undefined ||
      payload.old_invitee === null ||
      typeof payload.old_invitee === "string")
  );
}

function isCalendlyEventResult(value: unknown): value is CalendlyEventResult {
  if (!isRecord(value) || !isRecord(value.resource)) {
    return false;
  }
  return (
    typeof value.resource.event_type === "string" &&
    isCalendlyApiUri(value.resource.event_type, "/event_types/") &&
    typeof value.resource.start_time === "string" &&
    Number.isFinite(Date.parse(value.resource.start_time))
  );
}

http.route({
  path: "/webhooks/calendly",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const accessToken = env.CALENDLY_ACCESS_TOKEN;
    const webhookSecret = env.CALENDLY_WEBHOOK_SECRET;
    const eventTypeUri = env.CALENDLY_EVENT_TYPE_URI;
    if (!webhookSecret) {
      return new Response("Calendly webhook is not configured", { status: 503 });
    }
    if (url.searchParams.get("secret") !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!accessToken || !eventTypeUri) {
      return new Response("Calendly webhook is not configured", { status: 503 });
    }
    let webhook: unknown;
    try {
      webhook = await request.json();
    } catch {
      return new Response("Invalid Calendly payload", { status: 400 });
    }
    if (!isCalendlyWebhook(webhook)) {
      return new Response("Invalid Calendly payload", { status: 400 });
    }

    const eventResponse = await fetch(webhook.payload.event, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!eventResponse.ok) {
      return new Response("Calendly event lookup failed", { status: 502 });
    }
    let eventResult: unknown;
    try {
      eventResult = await eventResponse.json();
    } catch {
      return new Response("Invalid Calendly event", { status: 502 });
    }
    if (!isCalendlyEventResult(eventResult)) {
      return new Response("Invalid Calendly event", { status: 502 });
    }
    const result = await ctx.runMutation(internal.calendly.syncBooking, {
      kind: webhook.event === "invitee.created" ? "created" : "canceled",
      expectedEventTypeUri: eventTypeUri,
      eventTypeUri: eventResult.resource.event_type,
      inviteeUri: webhook.payload.uri,
      scheduledEventUri: webhook.payload.event,
      name: webhook.payload.name.trim(),
      email: webhook.payload.email.trim(),
      phone: (webhook.payload.text_reminder_number ?? "").trim(),
      startTime: eventResult.resource.start_time,
      rescheduled: webhook.payload.rescheduled,
      ...(webhook.payload.old_invitee
        ? { oldInviteeUri: webhook.payload.old_invitee }
        : {})
    });
    return Response.json(result);
  })
});

export default http;
