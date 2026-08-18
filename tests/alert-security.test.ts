import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAlertEmail,
  openAlertToken,
  requestIsSameOrigin,
  sealAlertToken,
} from "../lib/alert-security.ts";

const secret = "test-only-alert-signing-secret-with-more-than-32-characters";

test("normalizes valid mailbox addresses and rejects unsafe input", () => {
  assert.equal(normalizeAlertEmail(" User@Example.COM "), "user@example.com");
  assert.equal(normalizeAlertEmail("a@b"), null);
  assert.equal(normalizeAlertEmail("user@example.com\nBcc:x@example.com"), null);
});

test("confirmation tokens hide the address and reject tampering or another purpose", () => {
  const token = sealAlertToken("user@example.com", "confirm", 60, secret);
  assert.equal(token.includes("user"), false);
  assert.deepEqual(openAlertToken(token, "confirm", secret)?.email, "user@example.com");
  assert.equal(openAlertToken(token, "unsubscribe", secret), null);
  const replacement = token.endsWith("A") ? "B" : "A";
  assert.equal(openAlertToken(`${token.slice(0, -1)}${replacement}`, "confirm", secret), null);
});

test("expired tokens and cross-origin form submissions are rejected", () => {
  const expired = sealAlertToken("user@example.com", "confirm", -1, secret);
  assert.equal(openAlertToken(expired, "confirm", secret), null);
  assert.equal(requestIsSameOrigin(new Request("https://us-japan-alert.vercel.app/api/alerts/subscribe", {
    headers: { origin: "https://us-japan-alert.vercel.app" },
  })), true);
  assert.equal(requestIsSameOrigin(new Request("https://us-japan-alert.vercel.app/api/alerts/subscribe", {
    headers: { origin: "https://attacker.example" },
  })), false);
});
