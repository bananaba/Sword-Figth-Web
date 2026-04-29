export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

export interface Env {
  RANKED_QUEUE: DurableObjectNamespace;
  DUEL_ROOM?: DurableObjectNamespace;
  /** Persistent player ratings + W/L/D ledger (Phase 11c). */
  LEADERBOARD?: DurableObjectNamespace;
}
