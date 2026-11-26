import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const version = 1;
const nonceLength = 12;
const tagLength = 16;
const prefixLength = 1 + nonceLength + tagLength;

function derivedKey(key: Buffer, purpose: string) {
  return Buffer.from(hkdfSync("sha256", key, "", `tracker:gmail:${purpose}:v1`, 32));
}

export function encryptGmailData(key: Buffer, purpose: "oauth" | "candidate", value: string): Buffer {
  const nonce = randomBytes(nonceLength);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(key, purpose), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([version]), nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptGmailData(key: Buffer, purpose: "oauth" | "candidate", value: Uint8Array): string {
  if (value.length <= prefixLength || value[0] !== version) throw new Error("Invalid Gmail data.");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(key, purpose), value.subarray(1, 1 + nonceLength));
  decipher.setAuthTag(value.subarray(1 + nonceLength, prefixLength));
  return Buffer.concat([decipher.update(value.subarray(prefixLength)), decipher.final()]).toString("utf8");
}

export function gmailLocalIdentifier(key: Buffer, purpose: "mailbox" | "message", value: string): string {
  return createHmac("sha256", derivedKey(key, purpose)).update(value).digest("hex");
}
