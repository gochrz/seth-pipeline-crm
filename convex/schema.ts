import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { leadInputValidator } from "./validators";

export default defineSchema({
  leads: defineTable({
    ...leadInputValidator.fields,
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_updated_at", ["updatedAt"]),
  calendlyBookings: defineTable({
    inviteeUri: v.string(),
    scheduledEventUri: v.string(),
    eventTypeUri: v.string(),
    leadId: v.id("leads"),
    status: v.union(v.literal("active"), v.literal("canceled")),
    startTime: v.string(),
    updatedAt: v.number()
  }).index("by_invitee_uri", ["inviteeUri"])
});
