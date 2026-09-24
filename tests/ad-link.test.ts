import { describe, it, expect } from "vitest";
import { normalizeAdLink } from "@/lib/ad-link";

describe("ad links", () => {
  it("accepts site paths and sponsor websites", () => {
    expect(normalizeAdLink("")).toBeNull();
    expect(normalizeAdLink("/sell")).toBe("/sell");
    expect(normalizeAdLink("https://sponsor.mv/offer")).toBe("https://sponsor.mv/offer");
    expect(normalizeAdLink("www.sponsor.mv")).toBe("https://www.sponsor.mv/");
  });
  it("rejects unsafe links", () => {
    expect(() => normalizeAdLink("javascript:alert(1)")).toThrow();
    expect(normalizeAdLink("//evil.com")).toBe("https://evil.com/");
    expect(() => normalizeAdLink("data:text/html,hi")).toThrow();
  });
});
