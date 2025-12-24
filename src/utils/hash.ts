export function hashInput(
  source: string,
  format: "mermaid" | "d2",
  outputType: "svg" | "png"
): string {
  const input = `${source}|${format}|${outputType}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}
