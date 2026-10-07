export enum DecisionScope {
  GLOBAL = "GLOBAL",
  SUBSYSTEM = "SUBSYSTEM",
}

export enum DecisionAuthority {
  OWNER = "OWNER",
  SUBSYSTEM_ADMIN = "SUBSYSTEM_ADMIN",
}

/** Explicit decision placement, independent of the actor's compatibility role. */
export type DecisionPlacement =
  | {
      scope: DecisionScope.GLOBAL;
      authority: DecisionAuthority.OWNER;
      subsystemId: null;
    }
  | {
      scope: DecisionScope.SUBSYSTEM;
      authority: DecisionAuthority;
      subsystemId: string;
    };

export enum DecisionStatus {
  PROPOSED = "PROPOSED",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  SUPERSEDED = "SUPERSEDED",
  DEFERRED = "DEFERRED",
}

export interface DecisionRecord {
  /** Nullable/optional during expand-first rollout; not permission to mutate. */
  scope?: DecisionScope | null;
  authority?: DecisionAuthority | null;
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
    avatarUrl?: string | null;
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
