import { v } from "convex/values";

export const stageValidator = v.union(
  v.literal("lead"),
  v.literal("qualified"),
  v.literal("downsell"),
  v.literal("closed"),
  v.literal("lost")
);

export const offerValidator = v.union(
  v.literal(""),
  v.literal("core"),
  v.literal("downsell")
);

export const closerValidator = v.union(
  v.literal(""),
  v.literal("Ben"),
  v.literal("Dylan"),
  v.literal("Seth")
);

export const noteValidator = v.object({
  ts: v.number(),
  text: v.string(),
  auto: v.boolean()
});

export const leadInputValidator = v.object({
  name: v.string(),
  email: v.string(),
  phone: v.string(),
  source: v.string(),
  stage: stageValidator,
  offer: offerValidator,
  closer: closerValidator,
  value: v.number(),
  lastMeeting: v.string(),
  nextMeeting: v.string(),
  nextStep: v.string(),
  notes: v.array(noteValidator)
});

export const leadDocumentValidator = v.object({
  _id: v.id("leads"),
  _creationTime: v.number(),
  name: v.string(),
  email: v.string(),
  phone: v.string(),
  source: v.string(),
  stage: stageValidator,
  offer: offerValidator,
  closer: closerValidator,
  value: v.number(),
  lastMeeting: v.string(),
  nextMeeting: v.string(),
  nextStep: v.string(),
  notes: v.array(noteValidator),
  createdAt: v.number(),
  updatedAt: v.number()
});

export const listResultValidator = v.object({
  leads: v.array(leadDocumentValidator),
  limited: v.boolean()
});
