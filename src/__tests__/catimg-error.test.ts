import { describe, it, expect } from "bun:test";
import { CatimgError } from "../errors/catimg-error";

describe("CatimgError", () => {
  it("has correct name and message", () => {
    const error = new CatimgError("catimg failed");
    expect(error.name).toBe("CatimgError");
    expect(error.message).toBe("catimg failed");
  });

  it("is an instance of Error", () => {
    const error = new CatimgError("test");
    expect(error).toBeInstanceOf(Error);
  });
});
