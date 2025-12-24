import { describe, test, expect } from "bun:test";
import { hashInput } from "../utils/hash";

describe("hashInput", () => {
  test("produces consistent hash for same input", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    expect(hash1).toBe(hash2);
  });

  test("produces different hash for different source", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->C;", "mermaid", "svg");
    expect(hash1).not.toBe(hash2);
  });

  test("produces different hash for different format", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->B;", "d2", "svg");
    expect(hash1).not.toBe(hash2);
  });

  test("produces different hash for different outputType", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->B;", "mermaid", "png");
    expect(hash1).not.toBe(hash2);
  });

  test("produces hex string", () => {
    const hash = hashInput("test", "mermaid", "svg");
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  test("produces same hash regardless of whitespace", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("  graph TD;   A-->B;  ", "mermaid", "svg");
    const hash3 = hashInput("graph\nTD;\tA-->B;", "mermaid", "svg");
    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3);
  });

  test("produces same hash for different line endings", () => {
    const hash1 = hashInput("graph TD\nA-->B", "mermaid", "svg");
    const hash2 = hashInput("graph TD\r\nA-->B", "mermaid", "svg");
    expect(hash1).toBe(hash2);
  });
});
