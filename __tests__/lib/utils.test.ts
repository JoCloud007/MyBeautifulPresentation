import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn utility", () => {
  it("merges simple class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes with objects", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("handles arrays of classes", () => {
    expect(cn(["foo", "bar"], "baz")).toBe("foo bar baz");
  });

  it("handles undefined and null values", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("merges Tailwind conflicting classes (last wins)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });

  it("handles complex mixed input", () => {
    const result = cn(
      "flex items-center",
      undefined,
      { "bg-red-500": true, "bg-blue-500": false },
      ["gap-2", "p-4"],
      "rounded-lg"
    );
    expect(result).toContain("flex");
    expect(result).toContain("items-center");
    expect(result).toContain("bg-red-500");
    expect(result).toContain("gap-2");
    expect(result).toContain("p-4");
    expect(result).toContain("rounded-lg");
    expect(result).not.toContain("bg-blue-500");
  });

  it("deduplicates classes", () => {
    expect(cn("px-2", "px-2")).toBe("px-2");
  });
});
