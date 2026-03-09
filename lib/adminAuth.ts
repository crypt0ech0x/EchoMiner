// lib/admin-auth.ts
import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "echo_admin_session";
const ADMIN_COOKIE_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getAdminSecret() {
  return process.env.ADMIN_COOKIE_SECRET || "dev_admin_secret_change_me";
}

function sign(value: string) {
  return crypto
    .createHmac("sha256", getAdminSecret())
    .update(value)
    .digest("hex");
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function makeCookieValue(username: string, expiresAtMs: number) {
  const payload = `${username}.${expiresAtMs}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function parseCookieValue(value: string | undefined) {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length < 3) return null;

  const sig = parts.pop() as string;
  const expiresAtRaw = parts.pop() as string;
  const username = parts.join(".");

  const payload = `${username}.${expiresAtRaw}`;
  const expectedSig = sign(payload);

  if (!safeEqual(sig, expectedSig)) return null;

  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  if (Date.now() > expiresAtMs) return null;

  return {
    username,
    expiresAtMs,
  };
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return !!parseCookieValue(raw);
}

export async function requireAdminRequest() {
  const ok = await isAdminAuthenticated();
  return ok;
}

export async function createAdminSession(username: string) {
  const cookieStore = await cookies();
  const expiresAtMs = Date.now() + ADMIN_COOKIE_TTL_SECONDS * 1000;
  const value = makeCookieValue(username, expiresAtMs);

  cookieStore.set(ADMIN_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_TTL_SECONDS,
  });

  return { expiresAtMs };
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete({
    name: ADMIN_COOKIE_NAME,
    path: "/",
  });
}

export function validateAdminCredentials(username: string, password: string) {
  const envUser = process.env.ADMIN_USER || "";
  const envPass = process.env.ADMIN_PASS || "";

  if (!envUser || !envPass) return false;

  const userOk =
    username.length === envUser.length &&
    safeEqual(username, envUser);

  const passOk =
    password.length === envPass.length &&
    safeEqual(password, envPass);

  return userOk && passOk;
}