import {
  CLOSERS,
  OFFERS,
  STAGES,
  normalizeLeadDraft,
  type Closer,
  type LeadRecord,
  type OfferId,
  type StageId
} from "./domain";
import { importLeadsFromCsv, serializeLeadsToCsv } from "./csv";
import { PipelineClient } from "./data";
import {
  emptyFilters,
  escapeHtml,
  hasFilters,
  renderBoardMarkup,
  renderReadoutMarkup,
  type Filters,
  type WhenFilter
} from "./view";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element: ${id}`);
  }
  return found as T;
}

const board = element<HTMLDivElement>("board");
const blank = element<HTMLDivElement>("blank");
const blankTitle = element<HTMLHeadingElement>("blankTitle");
const blankText = element<HTMLParagraphElement>("blankText");
const blankAdd = element<HTMLButtonElement>("blankAdd");
const readout = element<HTMLDivElement>("readout");
const closerFilter = element<HTMLDivElement>("closerFilter");
const clearChip = element<HTMLButtonElement>("clearChip");
const search = element<HTMLInputElement>("search");
const drawer = element<HTMLElement>("drawer");
const scrim = element<HTMLDivElement>("scrim");
const drawerBody = element<HTMLDivElement>("dBody");
const drawerError = element<HTMLDivElement>("drawerError");
const drawerEyebrow = element<HTMLDivElement>("dEyebrow");
const drawerTitle = element<HTMLHeadingElement>("dTitle");
const deleteButton = element<HTMLButtonElement>("deleteBtn");
const saveButton = element<HTMLButtonElement>("saveBtn");
const importFile = element<HTMLInputElement>("importFile");
const toastElement = element<HTMLDivElement>("toast");

let leads: LeadRecord[] = [];
let filters: Filters = emptyFilters();
let editing: LeadRecord | null = null;
let dirty = false;
let loaded = false;
let busy = false;
let toastTimer = 0;
let dragId: string | null = null;

function uid(): string {
  return `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function blankLead(): LeadRecord {
  const now = Date.now();
  return {
    id: "",
    name: "",
    email: "",
    phone: "",
    source: "",
    stage: "lead",
    offer: "",
    closer: "",
    value: 0,
    lastMeeting: "",
    nextMeeting: "",
    nextStep: "",
    notes: [],
    createdAt: now,
    updatedAt: now
  };
}

function toast(message: string): void {
  toastElement.textContent = message;
  toastElement.classList.add("on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastElement.classList.remove("on"), 2100);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    const lastLine = error.message.trim().split("\n").at(-1);
    return lastLine || "Something went wrong";
  }
  return "Something went wrong";
}

function toggle<T>(set: Set<T>, value: T): void {
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
}

function renderBlank(): void {
  if (!loaded) {
    blank.style.display = "grid";
    blankTitle.textContent = "Loading pipeline";
    blankText.textContent = "Connecting to the shared board…";
    blankAdd.hidden = true;
    return;
  }
  if (leads.length === 0) {
    blank.style.display = "grid";
    blankTitle.textContent = "No leads yet";
    blankText.textContent = "Add the first one, or import a CSV.";
    blankAdd.hidden = false;
    return;
  }
  blank.style.display = "none";
}

function wireReadout(): void {
  const pairs: Array<[string, WhenFilter]> = [
    ["jumpBooked", "booked"],
    ["jumpUnbooked", "unbooked"],
    ["jumpOverdue", "overdue"]
  ];
  for (const [id, value] of pairs) {
    document.getElementById(id)?.addEventListener("click", () => {
      toggle(filters.when, value);
      render();
    });
  }
}

function renderFilters(): void {
  closerFilter.replaceChildren();
  for (const name of CLOSERS) {
    const button = document.createElement("button");
    button.className = "mono-btn who";
    button.textContent = name.charAt(0);
    button.title = name;
    button.setAttribute("aria-pressed", String(filters.closer.has(name)));
    button.addEventListener("click", () => {
      toggle(filters.closer, name);
      render();
    });
    closerFilter.append(button);
  }
  document.querySelectorAll<HTMLButtonElement>("[data-offer]").forEach((button) => {
    const offer = OFFERS.find((candidate) => candidate.id === button.dataset.offer)?.id;
    if (!offer) {
      return;
    }
    button.setAttribute("aria-pressed", String(filters.offer.has(offer)));
    button.onclick = () => {
      toggle(filters.offer, offer);
      render();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-when]").forEach((button) => {
    const value = button.dataset.when;
    if (value !== "booked" && value !== "unbooked" && value !== "overdue") {
      return;
    }
    button.setAttribute("aria-pressed", String(filters.when.has(value)));
    button.onclick = () => {
      toggle(filters.when, value);
      render();
    };
  });
  clearChip.style.display = hasFilters(filters) ? "" : "none";
}

function wireBoard(): void {
  board.querySelectorAll<HTMLElement>(".card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      dragId = card.dataset.id ?? null;
      card.classList.add("dragging");
      if (event.dataTransfer && dragId) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", dragId);
      }
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      dragId = null;
    });
    card.addEventListener("click", () => openDrawer(card.dataset.id ?? ""));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDrawer(card.dataset.id ?? "");
      }
    });
  });
  board.querySelectorAll<HTMLElement>(".drop").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("over");
      const leadId = dragId || event.dataTransfer?.getData("text/plain") || "";
      const stage = STAGES.find((candidate) => candidate.id === zone.dataset.stage)?.id;
      if (leadId && stage) {
        void moveLead(leadId, stage);
      }
    });
  });
}

function render(): void {
  const now = new Date();
  readout.innerHTML = renderReadoutMarkup(leads, filters, now);
  board.innerHTML = renderBoardMarkup(leads, filters, now);
  renderFilters();
  renderBlank();
  wireReadout();
  wireBoard();
}

function setBusy(value: boolean): void {
  busy = value;
  saveButton.disabled = value;
  deleteButton.disabled = value;
  saveButton.textContent = value ? "Saving…" : "Save";
}

function setDrawerError(message: string): void {
  drawerError.textContent = message;
  drawerError.hidden = !message;
}

function closeDrawer(): void {
  drawer.classList.remove("on");
  scrim.classList.remove("on");
  editing = null;
  dirty = false;
  setDrawerError("");
}

function tryCloseDrawer(): void {
  if (busy) {
    return;
  }
  if (dirty && !window.confirm("Close without saving?")) {
    return;
  }
  closeDrawer();
}

function openDrawer(id: string): void {
  const source = id ? leads.find((lead) => lead.id === id) : null;
  if (id && !source) {
    toast("That lead no longer exists");
    return;
  }
  editing = source ? structuredClone(source) : blankLead();
  dirty = false;
  setDrawerError("");
  drawerEyebrow.textContent = source
    ? STAGES.find((stage) => stage.id === editing?.stage)?.name ?? "Lead"
    : "New lead";
  drawerTitle.textContent = editing.name || "Untitled";
  deleteButton.style.visibility = source ? "" : "hidden";
  renderDrawer();
  drawer.classList.add("on");
  scrim.classList.add("on");
  window.setTimeout(() => element<HTMLInputElement>("fName").focus(), 190);
}

function toDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMeeting(value: string): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" ", "");
  return `${day} · ${time}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function renderNotes(lead: LeadRecord): string {
  if (lead.notes.length === 0) {
    return '<li><span class="note-text auto">Nothing logged yet.</span></li>';
  }
  return lead.notes
    .map((note, index) => ({ note, index }))
    .reverse()
    .map(({ note, index }) => {
      const date = new Date(note.ts);
      const stamp = Number.isNaN(date.getTime())
        ? ""
        : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      return `<li>
        <div class="note-meta">
          <span class="mono">${escapeHtml(stamp)}</span>
          <button class="note-del" data-note-index="${index}">remove</button>
        </div>
        <div class="note-text ${note.auto ? "auto" : ""}">${escapeHtml(note.text)}</div>
      </li>`;
    })
    .join("");
}

function renderDrawer(): void {
  if (!editing) {
    return;
  }
  const nextMeeting = toDate(editing.nextMeeting);
  const past = nextMeeting && nextMeeting < new Date();
  drawerBody.innerHTML = `
    <div class="field">
      <label class="mono">Stage</label>
      <div class="seg stages" id="segStage">
        ${STAGES.map((stage) => `<button data-v="${stage.id}" aria-pressed="${editing?.stage === stage.id}">${stage.name}${stage.sub ? ` ·&nbsp;${stage.sub}` : ""}</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label class="mono" for="fName">Name</label>
      <input id="fName" value="${escapeHtml(editing.name)}" placeholder="Who is this" maxlength="120">
    </div>
    <div class="grid2">
      <div class="field">
        <label class="mono">Offer</label>
        <div class="seg" id="segOffer">
          ${OFFERS.map((offer) => `<button data-v="${offer.id}" aria-pressed="${editing?.offer === offer.id}">${offer.label}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label class="mono">Closer</label>
        <div class="seg" id="segCloser">
          ${CLOSERS.map((closer) => `<button data-v="${closer}" aria-pressed="${editing?.closer === closer}">${closer}</button>`).join("")}
        </div>
      </div>
    </div>
    <div class="grid2">
      <div class="field">
        <label class="mono" for="fMeet">Next meeting</label>
        <input id="fMeet" type="datetime-local" value="${escapeHtml(editing.nextMeeting)}">
        ${past ? '<button class="log-btn" id="logMeeting">Meeting happened — log it</button>' : ""}
      </div>
      <div class="field">
        <label class="mono" for="fLast">Last meeting</label>
        <input id="fLast" type="date" value="${escapeHtml(editing.lastMeeting)}" max="${today()}">
        ${editing.lastMeeting ? "" : '<div class="mono" style="margin-top:6px;text-transform:none;letter-spacing:0;font-size:11px">Haven\'t met yet</div>'}
      </div>
    </div>
    <div class="field">
      <label class="mono" for="fNext">Next step</label>
      <input id="fNext" value="${escapeHtml(editing.nextStep)}" placeholder="What happens next, and when" maxlength="500">
    </div>
    <div class="grid2">
      <div class="field">
        <label class="mono" for="fValue">Deal value</label>
        <input id="fValue" type="number" min="0" max="100000000" step="100" value="${editing.value || ""}" placeholder="0">
      </div>
      <div class="field">
        <label class="mono" for="fSource">Source</label>
        <input id="fSource" value="${escapeHtml(editing.source)}" placeholder="Where they came from" maxlength="120">
      </div>
    </div>
    <div class="grid2">
      <div class="field">
        <label class="mono" for="fEmail">Email</label>
        <input id="fEmail" type="email" value="${escapeHtml(editing.email)}" placeholder="Optional" maxlength="320">
      </div>
      <div class="field">
        <label class="mono" for="fPhone">Phone</label>
        <input id="fPhone" value="${escapeHtml(editing.phone)}" placeholder="Optional" maxlength="50">
      </div>
    </div>
    <div class="sect">
      <label class="mono" for="fNote" style="display:block;margin-bottom:7px">Notes</label>
      <div class="note-add">
        <textarea id="fNote" placeholder="What happened on the call" maxlength="4000"></textarea>
        <button class="btn" id="addNote">Add</button>
      </div>
      <ul class="notes" id="noteList">${renderNotes(editing)}</ul>
    </div>
  `;
  wireDrawer();
}

function updateStage(stage: StageId): void {
  if (!editing) {
    return;
  }
  editing.stage = stage;
  if (stage === "downsell" && !editing.offer) {
    editing.offer = "downsell";
  }
  drawerEyebrow.textContent = STAGES.find((candidate) => candidate.id === stage)?.name ?? "Lead";
  dirty = true;
  renderDrawer();
}

function updateOffer(offer: OfferId): void {
  if (!editing) {
    return;
  }
  editing.offer = editing.offer === offer ? "" : offer;
  dirty = true;
  renderDrawer();
}

function updateCloser(closer: Closer): void {
  if (!editing) {
    return;
  }
  editing.closer = editing.closer === closer ? "" : closer;
  dirty = true;
  renderDrawer();
}

function bindTextInput(id: string, key: "name" | "lastMeeting" | "nextMeeting" | "nextStep" | "email" | "phone" | "source"): void {
  const input = element<HTMLInputElement>(id);
  input.addEventListener("input", () => {
    if (!editing) {
      return;
    }
    editing[key] = input.value;
    dirty = true;
    if (key === "name") {
      drawerTitle.textContent = input.value || "Untitled";
    }
  });
}

function wireDrawer(): void {
  document.querySelectorAll<HTMLButtonElement>("#segStage button").forEach((button) => {
    const stage = STAGES.find((candidate) => candidate.id === button.dataset.v)?.id;
    if (stage) {
      button.onclick = () => updateStage(stage);
    }
  });
  document.querySelectorAll<HTMLButtonElement>("#segOffer button").forEach((button) => {
    const offer = OFFERS.find((candidate) => candidate.id === button.dataset.v)?.id;
    if (offer) {
      button.onclick = () => updateOffer(offer);
    }
  });
  document.querySelectorAll<HTMLButtonElement>("#segCloser button").forEach((button) => {
    const closer = CLOSERS.find((candidate) => candidate === button.dataset.v);
    if (closer) {
      button.onclick = () => updateCloser(closer);
    }
  });
  bindTextInput("fName", "name");
  bindTextInput("fLast", "lastMeeting");
  bindTextInput("fMeet", "nextMeeting");
  bindTextInput("fNext", "nextStep");
  bindTextInput("fEmail", "email");
  bindTextInput("fPhone", "phone");
  bindTextInput("fSource", "source");
  element<HTMLInputElement>("fValue").addEventListener("input", (event) => {
    if (!editing) {
      return;
    }
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) {
      editing.value = input.value ? input.valueAsNumber : 0;
      dirty = true;
    }
  });
  document.getElementById("logMeeting")?.addEventListener("click", () => {
    if (!editing) {
      return;
    }
    const date = toDate(editing.nextMeeting);
    if (!date) {
      return;
    }
    editing.lastMeeting = date.toISOString().slice(0, 10);
    editing.nextMeeting = "";
    editing.notes.push({
      ts: Date.now(),
      text: `Met ${formatMeeting(editing.lastMeeting)}`,
      auto: true
    });
    dirty = true;
    renderDrawer();
    toast("Logged — book the next one");
  });
  element<HTMLButtonElement>("addNote").addEventListener("click", () => {
    if (!editing) {
      return;
    }
    const input = element<HTMLTextAreaElement>("fNote");
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    if (editing.notes.length >= 100) {
      setDrawerError("A lead can have at most 100 notes");
      return;
    }
    editing.notes.push({ ts: Date.now(), text, auto: false });
    dirty = true;
    renderDrawer();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-note-index]").forEach((button) => {
    button.onclick = () => {
      if (!editing) {
        return;
      }
      const index = Number(button.dataset.noteIndex);
      if (Number.isInteger(index)) {
        editing.notes.splice(index, 1);
        dirty = true;
        renderDrawer();
      }
    };
  });
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
let client: PipelineClient | null = null;

async function moveLead(id: string, stage: StageId): Promise<void> {
  const current = leads.find((lead) => lead.id === id);
  if (!client || !current || current.stage === stage) {
    return;
  }
  try {
    await client.move(id, stage);
  } catch (error) {
    toast(errorMessage(error));
  }
}

async function saveLead(): Promise<void> {
  if (!client || !editing || busy) {
    return;
  }
  setDrawerError("");
  try {
    const normalized = normalizeLeadDraft(editing);
    setBusy(true);
    await client.save(normalized);
    closeDrawer();
    toast("Saved");
  } catch (error) {
    setDrawerError(errorMessage(error));
    const nameInput = document.getElementById("fName");
    if (!editing.name.trim() && nameInput instanceof HTMLInputElement) {
      nameInput.focus();
    }
  } finally {
    setBusy(false);
  }
}

async function deleteLead(): Promise<void> {
  if (!client || !editing || !editing.id || busy) {
    return;
  }
  if (!window.confirm(`Delete ${editing.name || "this lead"}? This can't be undone.`)) {
    return;
  }
  try {
    setBusy(true);
    await client.remove(editing.id);
    closeDrawer();
    toast("Deleted");
  } catch (error) {
    setDrawerError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

function exportCsv(): void {
  const content = serializeLeadsToCsv(leads);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `caslin-pipeline-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importCsv(file: File): Promise<void> {
  if (!client) {
    return;
  }
  try {
    const parsed = importLeadsFromCsv(await file.text(), Date.now(), uid);
    if (parsed.leads.length === 0) {
      toast("No rows had a name column");
      return;
    }
    const imported = await client.importMany(parsed.leads);
    const suffix = parsed.skipped ? ` · skipped ${parsed.skipped}` : "";
    toast(`Imported ${imported} lead${imported === 1 ? "" : "s"}${suffix}`);
  } catch (error) {
    toast(errorMessage(error));
  }
}

function start(): void {
  if (!convexUrl) {
    loaded = false;
    blankTitle.textContent = "Pipeline is not connected";
    blankText.textContent = "The Convex URL is missing from this deployment.";
    blankAdd.hidden = true;
    document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = true;
    });
    return;
  }
  client = new PipelineClient(convexUrl);
  const unsubscribe = client.subscribe(
    (snapshot) => {
      leads = snapshot.leads;
      loaded = true;
      render();
      if (snapshot.limited) {
        toast("Showing the 1,000 most recently updated leads");
      }
    },
    (error) => {
      loaded = false;
      blank.style.display = "grid";
      blankTitle.textContent = "Couldn't load the pipeline";
      blankText.textContent = errorMessage(error);
      blankAdd.hidden = true;
    }
  );
  window.addEventListener("pagehide", () => {
    unsubscribe();
    void client?.close();
  });
}

element<HTMLButtonElement>("addBtn").onclick = () => openDrawer("");
blankAdd.onclick = () => openDrawer("");
saveButton.onclick = () => void saveLead();
deleteButton.onclick = () => void deleteLead();
element<HTMLButtonElement>("cancelBtn").onclick = tryCloseDrawer;
element<HTMLButtonElement>("closeDrawer").onclick = tryCloseDrawer;
scrim.onclick = tryCloseDrawer;
search.oninput = () => {
  filters.q = search.value;
  render();
};
clearChip.onclick = () => {
  filters = emptyFilters();
  search.value = "";
  render();
};
element<HTMLButtonElement>("exportBtn").onclick = exportCsv;
element<HTMLButtonElement>("importBtn").onclick = () => importFile.click();
importFile.onchange = () => {
  const file = importFile.files?.[0];
  if (file) {
    void importCsv(file);
  }
  importFile.value = "";
};
document.addEventListener("keydown", (event) => {
  const drawerOpen = drawer.classList.contains("on");
  if (event.key === "Escape" && drawerOpen) {
    tryCloseDrawer();
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && drawerOpen) {
    event.preventDefault();
    void saveLead();
  }
  if (
    event.key === "/" &&
    !drawerOpen &&
    document.activeElement?.tagName !== "INPUT" &&
    document.activeElement?.tagName !== "TEXTAREA"
  ) {
    event.preventDefault();
    search.focus();
  }
});

render();
start();
