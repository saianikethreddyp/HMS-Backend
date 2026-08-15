import crypto from "node:crypto";

// Excludes visually ambiguous characters (0/O, 1/I) since staff read and
// write this code by hand onto physical cards.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateCardNumber(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return `CARD-${code}`;
}
