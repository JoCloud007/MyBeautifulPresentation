import { describe, it, expect } from "vitest";
import { isSlideThemeId, SLIDE_THEMES } from "../index";

describe("isSlideThemeId", () => {
  it("accepts every declared slide theme id", () => {
    for (const id of Object.keys(SLIDE_THEMES)) {
      expect(isSlideThemeId(id)).toBe(true);
    }
  });

  it("rejects inherited prototype keys", () => {
    // `value in SLIDE_THEMES` would wrongly accept these.
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(isSlideThemeId(key)).toBe(false);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isSlideThemeId("nope")).toBe(false);
    expect(isSlideThemeId("")).toBe(false);
    expect(isSlideThemeId(undefined)).toBe(false);
    expect(isSlideThemeId(null)).toBe(false);
    expect(isSlideThemeId(42)).toBe(false);
    expect(isSlideThemeId({})).toBe(false);
  });
});
