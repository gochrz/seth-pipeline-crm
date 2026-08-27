import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { leadInputValidator } from "./validators";

export default defineSchema({
  leads: defineTable({
    ...leadInputValidator.fields,
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_updated_at", ["updatedAt"])
});
