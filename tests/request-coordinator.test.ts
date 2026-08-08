import { describe, expect, it } from "vitest";
import { RequestCoordinator } from "../electron/main/translation/request-coordinator";

describe("RequestCoordinator", () => {
  it("只取消同一 lane 的旧请求", () => {
    const coordinator = new RequestCoordinator();
    const main = coordinator.begin("main-translation", "main-1");
    const popup = coordinator.begin("popup-translation", "popup-1");
    coordinator.begin("main-translation", "main-2");
    expect(main.aborted).toBe(true);
    expect(popup.aborted).toBe(false);
    expect(coordinator.isActive("popup-1")).toBe(true);
  });

  it("cancelRequest 和 cancelAll 可终止所有 lane", () => {
    const coordinator = new RequestCoordinator();
    const first = coordinator.begin("segment-revision", "revision-1");
    const second = coordinator.begin("dictionary-context", "dictionary-1");
    coordinator.cancelRequest("revision-1");
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    coordinator.cancelAll();
    expect(second.aborted).toBe(true);
  });
});

