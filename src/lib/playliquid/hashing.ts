// Content hashing for immutability & reproducibility.
// Uses Node's crypto to produce a sha256 hex digest of a canonical JSON form.

import { createHash } from "crypto";

export function contentHash(input: unknown): string {
  const canonical = canonicalJson(input);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

// Deterministic JSON: sorted keys, no whitespace.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson((value as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

export function shortHash(hash: string): string {
  return hash.length > 8 ? hash.slice(0, 8) : hash;
}
