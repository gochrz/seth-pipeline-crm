import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({
  env: {
    CALENDLY_ACCESS_TOKEN: v.optional(v.string()),
    CALENDLY_WEBHOOK_SECRET: v.optional(v.string()),
    CALENDLY_EVENT_TYPE_URI: v.optional(v.string())
  }
});
