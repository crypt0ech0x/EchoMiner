// lib/auth.ts
import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const COOKIE_NAME = "echo_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function newSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Only use an explicit env var for cross-subdomain cookies.
 * Example:
 * COOKIE_DOMAIN=.echominer.fun
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
    data: {
      id: sessionId,
      userId,
      expiresAt,
    },
  });

  return { sessionId, expiresAt, maxAgeSeconds };
}

export function attachSessionCookie(
  response: NextResponse,
  sessionId: string,
  opts?: { maxAgeSeconds?: number }
) {
  response.cookies.set(COOKIE_NAME, sessionId, cookieOptions(opts?.maxAgeSeconds));
  return response;
}

export async function revokeSessionCookie() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;

  if (sessionId) {
    try {
      await prisma.session.updateMany({
        where: {
          id: sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("revokeSessionCookie session update failed:", err);
    }
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

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            wallet: true,
          },
        },
      },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;

    return session.user;
  } catch (err) {
    console.error("getUserFromSessionCookie failed:", err);
    return null;
  }
}

export async function getSessionIdFromCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}