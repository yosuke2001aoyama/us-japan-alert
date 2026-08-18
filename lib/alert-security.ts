import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export type AlertTokenPurpose = "confirm" | "unsubscribe";
type AlertTokenPayload = { email: string; purpose: AlertTokenPurpose; exp: number };

const emailPattern = /^(?=.{3,254}$)[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function normalizeAlertEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.normalize("NFKC").trim().toLowerCase();
  return emailPattern.test(email) ? email : null;
}

function signingSecret(explicit?: string) {
  const secret = explicit || process.env.ALERT_SIGNING_SECRET || process.env.RESEND_API_KEY || "";
  if (secret.length < 32) throw new Error("ALERT_SIGNING_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update("jpus-alert-token-v1").digest();
}

export function sealAlertToken(
  email: string,
  purpose: AlertTokenPurpose,
  ttlSeconds: number,
  explicitSecret?: string,
) {
  const normalized = normalizeAlertEmail(email);
  if (!normalized) throw new Error("Invalid email");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", signingSecret(explicitSecret), iv);
  const plaintext = Buffer.from(JSON.stringify({
    email: normalized,
    purpose,
    exp: Math.floor(Date.now() / 1_000) + ttlSeconds,
  } satisfies AlertTokenPayload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openAlertToken(
  token: string,
  expectedPurpose: AlertTokenPurpose,
  explicitSecret?: string,
): AlertTokenPayload | null {
  try {
    if (!/^[A-Za-z0-9_-]{40,4096}$/.test(token)) return null;
    const packed = Buffer.from(token, "base64url");
    if (packed.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", signingSecret(explicitSecret), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final(),
    ]).toString("utf8")) as Partial<AlertTokenPayload>;
    const email = normalizeAlertEmail(payload.email);
    if (!email || payload.purpose !== expectedPurpose || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1_000)) return null;
    return { email, purpose: expectedPurpose, exp: payload.exp };
  } catch {
    return null;
  }
}

export function alertHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function requestIsSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function requestRateLimited(request: Request, scope: string, maximum: number, windowMs: number) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "unknown";
  const address = forwarded.split(",")[0].trim().slice(0, 128);
  const key = `${scope}:${alertHash(address)}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 2_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    return false;
  }
  current.count += 1;
  return current.count > maximum;
}

export function dashboardOrigin() {
  const configured = process.env.PUBLIC_DASHBOARD_URL || "https://us-japan-alert.vercel.app";
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("PUBLIC_DASHBOARD_URL must use HTTPS");
  return url.origin;
}
