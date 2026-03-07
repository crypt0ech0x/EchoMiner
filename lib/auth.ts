// lib/auth.ts
import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "echo_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function newSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Only use an explicit env var for cross-subdomain cookies.
 * Otherwise leave domain undefined so the browser sets a host-only cookie.
 */
function cookieDomain() {
  const raw = process.env.COOKIE_DOMAIN?.trim();
  return raw ? raw : undefined;
}

function cookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(typeof maxAgeSeconds === "number" ? { maxAge: maxAgeSeconds } : {}),
    ...(cookieDomain() ? { domain: cookieDomain() } : {}),
  };
}

export async function createSessionForUser(
  userId: string,
  opts?: { maxAgeSeconds?: number }
) {
  const maxAgeSeconds = opts?.maxAgeSeconds ?? DEFAULT_SESSION_TTL_SECONDS;

  const sessionId = newSessionId();
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await prisma.session.create({
    data: { id: sessionId, userId, expiresAt },
  });

  return { sessionId, expiresAt, maxAgeSeconds };
}

export function attachSessionCookie(
  response: NextResponse,
  sessionId: string,
  opts?: { maxAgeSeconds?: number }
) {
  const maxAgeSeconds = opts?.maxAgeSeconds ?? DEFAULT_SESSION_TTL_SECONDS;

  response.cookies.set(COOKIE_NAME, sessionId, cookieOptions(maxAgeSeconds));
  return response;
}

export async function revokeSessionCookie() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;

  if (sessionId) {
    await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieStore.delete({
    name: COOKIE_NAME,
    path: "/",
    ...(cookieDomain() ? { domain: cookieDomain() } : {}),
  });
}

export async function getUserFromSessionCookie() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: { include: { wallet: true } },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return session.user;
}