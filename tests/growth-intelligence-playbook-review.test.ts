import { describe, expect, it } from "vitest";

import { canTransitionPlaybookReview } from "@/modules/growth-intelligence/playbook-review";

describe("playbook review governance", () => {
  it("allows draft proposals to be submitted", () => {
    expect(canTransitionPlaybookReview("DRAFT", "SUBMITTED")).toBe(true);
  });

  it("allows submitted proposals to be approved or rejected", () => {
    expect(canTransitionPlaybookReview("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransitionPlaybookReview("SUBMITTED", "REJECTED")).toBe(true);
  });

  it("keeps terminal decisions terminal", () => {
    expect(canTransitionPlaybookReview("APPROVED", "SUBMITTED")).toBe(false);
    expect(canTransitionPlaybookReview("REJECTED", "APPROVED")).toBe(false);
  });

  it("does not allow a draft to skip review", () => {
    expect(canTransitionPlaybookReview("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionPlaybookReview("DRAFT", "REJECTED")).toBe(false);
  });
});
