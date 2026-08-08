export type RequestLane =
  | "main-translation"
  | "popup-translation"
  | "segment-revision"
  | "segment-alternatives"
  | "dictionary-context";

interface ActiveLaneRequest {
  lane: RequestLane;
  requestId: string;
  controller: AbortController;
}

/** Owns business request lifecycles; model concurrency remains scheduler-owned. */
export class RequestCoordinator {
  private readonly active = new Map<RequestLane, ActiveLaneRequest>();

  begin(lane: RequestLane, requestId: string): AbortSignal {
    this.cancel(lane);
    const request = { lane, requestId, controller: new AbortController() } satisfies ActiveLaneRequest;
    this.active.set(lane, request);
    return request.controller.signal;
  }

  end(requestId: string): void {
    for (const [lane, request] of this.active) {
      if (request.requestId === requestId) this.active.delete(lane);
    }
  }

  cancel(lane: RequestLane, requestId?: string): void {
    const request = this.active.get(lane);
    if (!request || (requestId && request.requestId !== requestId)) return;
    request.controller.abort();
    this.active.delete(lane);
  }

  cancelRequest(requestId?: string): void {
    if (!requestId) return this.cancelAll();
    for (const [lane, request] of this.active) {
      if (request.requestId === requestId) {
        request.controller.abort();
        this.active.delete(lane);
      }
    }
  }

  cancelAll(): void {
    for (const request of this.active.values()) request.controller.abort();
    this.active.clear();
  }

  isActive(requestId: string): boolean {
    return [...this.active.values()].some((request) => request.requestId === requestId);
  }

  getLane(requestId: string): RequestLane | undefined {
    return [...this.active.values()].find((request) => request.requestId === requestId)?.lane;
  }
}

