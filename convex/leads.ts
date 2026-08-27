import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  leadInputValidator,
  listResultValidator,
  stageValidator
} from "./validators";

type LeadInput = Infer<typeof leadInputValidator>;

const stageNames = {
  lead: "Lead",
  qualified: "Qualified",
  downsell: "Unqualified",
  closed: "Closed",
  lost: "Lost"
} as const;

function fail(message: string): never {
  throw new ConvexError(message);
}

function requireLength(value: string, maximum: number, message: string): void {
  if (value.length > maximum) {
    fail(message);
  }
}

function normalizeLead(lead: LeadInput): LeadInput {
  const normalized = {
    ...lead,
    name: lead.name.trim(),
    email: lead.email.trim(),
    phone: lead.phone.trim(),
    source: lead.source.trim(),
    lastMeeting: lead.lastMeeting.trim(),
    nextMeeting: lead.nextMeeting.trim(),
    nextStep: lead.nextStep.trim(),
    notes: lead.notes.map((note) => ({ ...note, text: note.text.trim() }))
  };

  if (!normalized.name) {
    fail("Give the lead a name first");
  }
  requireLength(normalized.name, 120, "Lead name is too long");
  requireLength(normalized.email, 320, "Email is too long");
  requireLength(normalized.phone, 50, "Phone is too long");
  requireLength(normalized.source, 120, "Source is too long");
  requireLength(normalized.lastMeeting, 32, "Last meeting date is too long");
  requireLength(normalized.nextMeeting, 32, "Next meeting date is too long");
  requireLength(normalized.nextStep, 500, "Next step is too long");
  if (!Number.isFinite(normalized.value) || normalized.value < 0) {
    fail("Deal value must be zero or greater");
  }
  if (normalized.value > 100_000_000) {
    fail("Deal value is too large");
  }
  if (normalized.notes.length > 100) {
    fail("A lead can have at most 100 notes");
  }
  for (const note of normalized.notes) {
    if (!note.text) {
      fail("Notes cannot be empty");
    }
    requireLength(note.text, 4000, "Note is too long");
    if (!Number.isFinite(note.ts) || note.ts < 0) {
      fail("Note timestamp is invalid");
    }
  }
  return normalized;
}

export const list = query({
  args: {},
  returns: listResultValidator,
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("leads")
      .withIndex("by_updated_at")
      .order("desc")
      .take(1001);
    return {
      leads: rows.slice(0, 1000),
      limited: rows.length > 1000
    };
  }
});

export const save = mutation({
  args: {
    leadId: v.optional(v.id("leads")),
    lead: leadInputValidator
  },
  returns: v.id("leads"),
  handler: async (ctx, args) => {
    const lead = normalizeLead(args.lead);
    const now = Date.now();
    if (!args.leadId) {
      return await ctx.db.insert("leads", {
        ...lead,
        createdAt: now,
        updatedAt: now
      });
    }
    const existing = await ctx.db.get("leads", args.leadId);
    if (!existing) {
      fail("Lead not found");
    }
    await ctx.db.replace("leads", args.leadId, {
      ...lead,
      createdAt: existing.createdAt,
      updatedAt: now
    });
    return args.leadId;
  }
});

export const move = mutation({
  args: { leadId: v.id("leads"), stage: stageValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("leads", args.leadId);
    if (!existing) {
      fail("Lead not found");
    }
    if (existing.stage === args.stage) {
      return null;
    }
    const now = Date.now();
    const note = {
      ts: now,
      text: `${stageNames[existing.stage]} → ${stageNames[args.stage]}`,
      auto: true
    };
    await ctx.db.patch("leads", args.leadId, {
      stage: args.stage,
      offer: args.stage === "downsell" ? "downsell" : existing.offer,
      notes: [...existing.notes, note].slice(-100),
      updatedAt: now
    });
    return null;
  }
});

export const remove = mutation({
  args: { leadId: v.id("leads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("leads", args.leadId);
    if (!existing) {
      fail("Lead not found");
    }
    await ctx.db.delete("leads", args.leadId);
    return null;
  }
});

export const importMany = mutation({
  args: { leads: v.array(leadInputValidator) },
  returns: v.array(v.id("leads")),
  handler: async (ctx, args) => {
    if (args.leads.length > 200) {
      fail("Import at most 200 leads at a time");
    }
    const leads = args.leads.map(normalizeLead);
    const now = Date.now();
    return await Promise.all(
      leads.map((lead) =>
        ctx.db.insert("leads", {
          ...lead,
          createdAt: now,
          updatedAt: now
        })
      )
    );
  }
});
