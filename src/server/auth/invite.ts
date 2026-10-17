import { createHash, timingSafeEqual } from "node:crypto";

function sha256(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

/** Constant-time string comparison (equal-length buffers). */
export function timingSafeEq(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export function sha256Hex(input: string): string {
  return sha256(input).toString("hex");
}

export function randomTokenBase64url(bytes = 32): string {
  const bytes8 = new Uint8Array(bytes);
  crypto.getRandomValues(bytes8);
  return Buffer.from(bytes8).toString("base64url");
}
