export type Metrics = {
  keyboardPass: number | null;
  keyboardTotal: number | null;
  pointerPass: number | null;
  pointerTotal: number | null;
  violations: number | null;
  incomplete: number | null;
  measurementComplete?: boolean;
  observedAuditStates?: number;
};

export type EvidenceImage = { src: string; caption: string };
export type EvidenceFile = {
  label: string;
  path: string;
  kind: string;
  sha256: string;
  derived?: boolean;
};

export type RecordedCheck = {
  id: string;
  status: 'pass' | 'fail' | 'missing';
  expected?: unknown;
  actual?: unknown;
};

export type RecordedEvent = {
  kind: string;
  key?: string;
  focus?: {
    tag?: string | null;
    role?: string | null;
    name?: string | null;
    text?: string | null;
    inDialog?: boolean;
  };
  elapsed_s?: number;
  [field: string]: unknown;
};

export type RecordedAction = {
  phase: 'before' | 'after';
  taskId: string;
  label: string;
  keys?: string | string[];
  entries?: RecordedEvent[];
  expected?: unknown;
  actual?: unknown;
  passed?: boolean | null;
  source?: string;
};

export type RecordedTask = {
  id: string;
  name: string;
  mode: string;
  beforePassed: boolean | null;
  afterPassed: boolean | null;
  beforeChecks?: RecordedCheck[];
  afterChecks?: RecordedCheck[];
};

export type Case = {
  id: string;
  title: string;
  shortTitle?: string;
  kind?: string;
  decision: 'accepted' | 'rejected';
  manualReview: boolean;
  summary: string;
  problem: string;
  repairExplanation: string;
  decisionExplanation: string;
  metrics: { before: Metrics; after: Metrics };
  model: {
    id: string;
    requestedId?: string;
    provider?: string;
    requests?: number;
    tokens?: number;
    seconds?: number;
    costUsd?: number | null;
    automaticRetries?: number;
    recordedAt?: string;
  };
  images: {
    before: EvidenceImage;
    after: EvidenceImage;
    contrastBefore?: EvidenceImage;
    contrastAfter?: EvidenceImage;
    taskBefore?: EvidenceImage;
    taskAfter?: EvidenceImage;
  };
  patch: string;
  keyboardLog: RecordedAction[];
  tasks: RecordedTask[];
  files: EvidenceFile[];
  notes: string[];
  source?: { kind?: string; name?: string; url?: string; commit?: string; license?: string; sha256?: string };
};

export type Dataset = { version: number; notice: string; cases: Case[] };
