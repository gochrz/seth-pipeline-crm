import { describe, expect, it } from "vitest";
import type { LeadRecord } from "./domain";
import { fromLeadDocument, toLeadInput } from "./data";

const lead: LeadRecord = {
  id: "lead-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  source: "Referral",
  stage: "qualified",
  offer: "core",
  closer: "Ben",
  value: 12500,
  lastMeeting: "2026-08-20",
  nextMeeting: "2026-09-01T10:00",
  nextStep: "Send proposal",
  notes: [{ ts: 1, text: "Strong fit", auto: false }],
  createdAt: 10,
  updatedAt: 20
};

describe("Convex lead mapping", () => {
  it("removes client-only identity and timestamps before mutations", () => {
    const input = toLeadInput(lead);

    expect(input).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555-0100",
      source: "Referral",
      stage: "qualified",
      offer: "core",
      closer: "Ben",
      value: 12500,
      lastMeeting: "2026-08-20",
      nextMeeting: "2026-09-01T10:00",
      nextStep: "Send proposal",
      notes: [{ ts: 1, text: "Strong fit", auto: false }]
    });
  });

  it("maps a Convex document to the client lead identity", () => {
    const result = fromLeadDocument({
      _id: "convex-id",
      _creationTime: 5,
      ...toLeadInput(lead),
      createdAt: 10,
      updatedAt: 20
    });

    expect(result).toEqual({ ...lead, id: "convex-id" });
  });
});
