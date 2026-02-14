import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Commitment, Person, Settings, StoreData, ExtractedCommitment } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  hotkey: 'CommandOrControl+Shift+Space',
  recordingMode: 'toggle',
  openRouterApiKey: '',
  commitmentExtractionEnabled: true,
  startAtLogin: false,
};

const DEFAULT_DATA: StoreData = {
  settings: { ...DEFAULT_SETTINGS },
  commitments: [],
  people: [],
};

class Store {
  private data: StoreData;
  private filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'store.json');
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          commitments: parsed.commitments || [],
          people: parsed.people || [],
        };
      }
    } catch (e) {
      console.error('Failed to load store:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('Failed to save store:', e);
    }
  }

  // --- Settings ---
  getSettings(): Settings {
    return { ...this.data.settings };
  }

  saveSettings(partial: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();
  }

  // --- Commitments ---
  getCommitments(): Commitment[] {
    return [...this.data.commitments];
  }

  addCommitmentsFromExtraction(extracted: ExtractedCommitment[]): Commitment[] {
    const newCommitments: Commitment[] = extracted.map(e => ({
      id: crypto.randomUUID(),
      promise: e.promise,
      assignedTo: e.assigned_to === 'unknown' ? null : e.assigned_to,
      deadline: e.deadline === 'none' ? null : e.deadline,
      contextQuote: e.context_quote,
      isDone: false,
      createdAt: new Date().toISOString(),
    }));
    this.data.commitments.unshift(...newCommitments);
    this.save();
    return newCommitments;
  }

  addManualCommitment(promise: string, deadline: string | null): Commitment {
    const c: Commitment = {
      id: crypto.randomUUID(),
      promise,
      assignedTo: null,
      deadline,
      contextQuote: '',
      isDone: false,
      createdAt: new Date().toISOString(),
    };
    this.data.commitments.unshift(c);
    this.save();
    return c;
  }

  toggleDone(id: string): void {
    const c = this.data.commitments.find(c => c.id === id);
    if (c) { c.isDone = !c.isDone; this.save(); }
  }

  reorderCommitments(orderedIds: string[]): void {
    const map = new Map(this.data.commitments.map(c => [c.id, c]));
    const reordered: Commitment[] = [];
    for (const id of orderedIds) {
      const c = map.get(id);
      if (c) reordered.push(c);
    }
    // Append any that weren't in the list (safety net)
    for (const c of this.data.commitments) {
      if (!orderedIds.includes(c.id)) reordered.push(c);
    }
    this.data.commitments = reordered;
    this.save();
  }

  dismissCommitment(id: string): void {
    this.data.commitments = this.data.commitments.filter(c => c.id !== id);
    this.save();
  }

  clearAll(): void {
    this.data.commitments = [];
    this.save();
  }

  clearDone(): void {
    this.data.commitments = this.data.commitments.filter(c => !c.isDone);
    this.save();
  }

  getActiveCommitmentsText(): string {
    return this.data.commitments
      .filter(c => !c.isDone)
      .map((c, i) => {
        let line = `- [ ] ${c.promise}`;
        if (c.deadline) line += ` (by ${c.deadline})`;
        return line;
      })
      .join('\n');
  }

  // --- People ---
  getPeople(): Person[] {
    return [...this.data.people];
  }

  addPerson(name: string, role: string, notes: string): void {
    this.data.people.push({ id: crypto.randomUUID(), name, role, notes });
    this.save();
  }

  removePerson(id: string): void {
    this.data.people = this.data.people.filter(p => p.id !== id);
    this.save();
  }

  getEnrichedNames(): string[] {
    return this.data.people.map(p => p.role ? `${p.name} (${p.role})` : p.name);
  }
}

export const store = new Store();
