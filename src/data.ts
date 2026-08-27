import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { LeadRecord } from "./domain";

export type LeadInput = Omit<LeadRecord, "id" | "createdAt" | "updatedAt">;

export type LeadDocument = LeadInput & {
  _id: string;
  _creationTime: number;
  createdAt: number;
  updatedAt: number;
};

export function toLeadInput(lead: LeadRecord): LeadInput {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    stage: lead.stage,
    offer: lead.offer,
    closer: lead.closer,
    value: lead.value,
    lastMeeting: lead.lastMeeting,
    nextMeeting: lead.nextMeeting,
    nextStep: lead.nextStep,
    notes: lead.notes
  };
}

export function fromLeadDocument(document: LeadDocument): LeadRecord {
  return {
    id: document._id,
    name: document.name,
    email: document.email,
    phone: document.phone,
    source: document.source,
    stage: document.stage,
    offer: document.offer,
    closer: document.closer,
    value: document.value,
    lastMeeting: document.lastMeeting,
    nextMeeting: document.nextMeeting,
    nextStep: document.nextStep,
    notes: document.notes,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

export type PipelineSnapshot = {
  leads: LeadRecord[];
  limited: boolean;
};

export class PipelineClient {
  private readonly client: ConvexClient;

  constructor(url: string) {
    this.client = new ConvexClient(url);
  }

  subscribe(
    onData: (snapshot: PipelineSnapshot) => void,
    onError: (error: Error) => void
  ): () => void {
    const unsubscribe = this.client.onUpdate(
      api.leads.list,
      {},
      (result) => {
        onData({
          leads: result.leads.map((document) => fromLeadDocument(document)),
          limited: result.limited
        });
      },
      onError
    );
    return () => unsubscribe();
  }

  async save(lead: LeadRecord): Promise<string> {
    const input = toLeadInput(lead);
    return lead.id
      ? await this.client.mutation(api.leads.save, {
          leadId: lead.id as Id<"leads">,
          lead: input
        })
      : await this.client.mutation(api.leads.save, { lead: input });
  }

  async move(leadId: string, stage: LeadRecord["stage"]): Promise<void> {
    await this.client.mutation(api.leads.move, {
      leadId: leadId as Id<"leads">,
      stage
    });
  }

  async remove(leadId: string): Promise<void> {
    await this.client.mutation(api.leads.remove, {
      leadId: leadId as Id<"leads">
    });
  }

  async importMany(leads: LeadRecord[]): Promise<number> {
    let imported = 0;
    for (let index = 0; index < leads.length; index += 200) {
      const batch = leads.slice(index, index + 200).map(toLeadInput);
      const ids = await this.client.mutation(api.leads.importMany, { leads: batch });
      imported += ids.length;
    }
    return imported;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
