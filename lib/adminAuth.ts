// lib/adminAuth.ts
import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "echo_admin";
const TTL_SECONDS = 60 * 60 * 12; // 12 hours

function requireSecret() {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) throw new Error("Missing ADMIN_COOKIE_SECRET env var");
  return secret;
}

function sign(payload: string) {
  const secret = requireSecret();
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function setAdminCookie() {
  const now = Date.now();
  const exp = now + TTL_SECONDS * 1000;
  const payload = `${exp}`;
  const sig = sign(payload);
  const value = `${payload}.${sig}`;

  const store = await cookies();
  store.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearAdminCookie() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  const exp = Number(payload);
  if (!Number.isFinite(exp)) return false;
  if (Date.now() > exp) return false;

  return true;
}