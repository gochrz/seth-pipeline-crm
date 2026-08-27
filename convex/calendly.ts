import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const outcomeValidator = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("canceled"),
  v.literal("unchanged"),
  v.literal("ignored")
);

export const syncBooking = internalMutation({
  args: {
    kind: v.union(v.literal("created"), v.literal("canceled")),
    expectedEventTypeUri: v.string(),
    eventTypeUri: v.string(),
    inviteeUri: v.string(),
    scheduledEventUri: v.string(),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    startTime: v.string(),
    rescheduled: v.boolean(),
    oldInviteeUri: v.optional(v.string())
  },
  returns: v.object({
    outcome: outcomeValidator,
    leadId: v.optional(v.id("leads"))
  }),
  handler: async (ctx, args) => {
    if (args.eventTypeUri !== args.expectedEventTypeUri) {
      return { outcome: "ignored" as const };
    }

    const existingBooking = await ctx.db
      .query("calendlyBookings")
      .withIndex("by_invitee_uri", (query) =>
        query.eq("inviteeUri", args.inviteeUri)
      )
      .unique();

    if (args.kind === "canceled") {
      if (!existingBooking) {
        return { outcome: "ignored" as const };
      }
      if (existingBooking.status === "canceled") {
        return {
          outcome: "unchanged" as const,
          leadId: existingBooking.leadId
        };
      }
      const now = Date.now();
      await ctx.db.patch("calendlyBookings", existingBooking._id, {
        status: "canceled",
        updatedAt: now
      });

      if (!args.rescheduled) {
        const lead = await ctx.db.get("leads", existingBooking.leadId);
        if (lead) {
          await ctx.db.patch("leads", existingBooking.leadId, {
            nextMeeting:
              lead.nextMeeting === existingBooking.startTime
                ? ""
                : lead.nextMeeting,
            notes: [
              ...lead.notes,
              {
                ts: now,
                text: "Calendly booking canceled",
                auto: true
              }
            ].slice(-100),
            updatedAt: now
          });
        }
      }

      return {
        outcome: "canceled" as const,
        leadId: existingBooking.leadId
      };
    }

    if (existingBooking) {
      return {
        outcome: "unchanged" as const,
        leadId: existingBooking.leadId
      };
    }

    const now = Date.now();
    if (args.oldInviteeUri) {
      const oldBooking = await ctx.db
        .query("calendlyBookings")
        .withIndex("by_invitee_uri", (query) =>
          query.eq("inviteeUri", args.oldInviteeUri as string)
        )
        .unique();
      if (oldBooking) {
        const lead = await ctx.db.get("leads", oldBooking.leadId);
        if (lead) {
          await ctx.db.patch("calendlyBookings", oldBooking._id, {
            status: "canceled",
            updatedAt: now
          });
          await ctx.db.patch("leads", oldBooking.leadId, {
            name: args.name,
            email: args.email,
            phone: args.phone,
            source: "Calendly",
            nextMeeting: args.startTime,
            nextStep: "Attend intro call",
            notes: [
              ...lead.notes,
              {
                ts: now,
                text: "Calendly booking rescheduled",
                auto: true
              }
            ].slice(-100),
            updatedAt: now
          });
          await ctx.db.insert("calendlyBookings", {
            inviteeUri: args.inviteeUri,
            scheduledEventUri: args.scheduledEventUri,
            eventTypeUri: args.eventTypeUri,
            leadId: oldBooking.leadId,
            status: "active",
            startTime: args.startTime,
            updatedAt: now
          });
          return {
            outcome: "updated" as const,
            leadId: oldBooking.leadId
          };
        }
      }
    }

    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      email: args.email,
      phone: args.phone,
      source: "Calendly",
      stage: "lead",
      offer: "core",
      closer: "Ben",
      value: 0,
      lastMeeting: "",
      nextMeeting: args.startTime,
      nextStep: "Attend intro call",
      notes: [],
      createdAt: now,
      updatedAt: now
    });

    await ctx.db.insert("calendlyBookings", {
      inviteeUri: args.inviteeUri,
      scheduledEventUri: args.scheduledEventUri,
      eventTypeUri: args.eventTypeUri,
      leadId,
      status: "active",
      startTime: args.startTime,
      updatedAt: now
    });

    return { outcome: "created" as const, leadId };
  }
});
