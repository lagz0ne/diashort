function normalizeSource(source: string): string {
  return source
    .trim()
    .replace(/\s+/g, ' ');
}

export function hashInput(
  source: string,
  format: "mermaid" | "d2",
  outputType: "svg" | "png"
): string {
  const normalizedSource = normalizeSource(source);
  const input = `${normalizedSource}|${format}|${outputType}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}
