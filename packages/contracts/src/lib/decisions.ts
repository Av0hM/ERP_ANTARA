export enum DecisionStatus {
  PROPOSED = "PROPOSED",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  SUPERSEDED = "SUPERSEDED",
  DEFERRED = "DEFERRED",
}

export interface DecisionRecord {
  id: string;
  title: string;
  status: DecisionStatus;
  context: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  consequences?: string | null;
  authorId: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  subsystemId?: string | null;
  subsystem?: {
    id: string;
    name: string;
    slug: string;
    color: string;
  } | null;
  relatedTaskIds: string[];
  supersededById?: string | null;
  supersededBy?: {
    id: string;
    title: string;
    status: DecisionStatus;
  } | null;
  supersedes?: {
    id: string;
    title: string;
    status: DecisionStatus;
  } | null;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string | null;
}

export interface DecisionListResponse {
  decisions: DecisionRecord[];
  total: number;
}