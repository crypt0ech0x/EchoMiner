// lib/auth.ts
import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const COOKIE_NAME = "echo_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function newSessionId() {
  return crypto.randomBytes(32).toString("hex");
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

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });

  return { sessionId, expiresAt };
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

  cookieStore.delete(COOKIE_NAME);
}

export async function getUserFromSessionCookie() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        include: { wallet: true },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return session.user;
}