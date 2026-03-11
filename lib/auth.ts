// lib/auth.ts
import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const COOKIE_NAME = "echo_session";
export const SESSION_HEADER_NAME = "x-session-id";
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
    data: {
      id: sessionId,
      userId,
      expiresAt,
    },
  });

  return { sessionId, expiresAt, maxAgeSeconds };
}

async function getValidSessionById(sessionId: string) {
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

    return session;
  } catch (err) {
    console.error("getValidSessionById failed:", err);
    return null;
  }
}

export async function getUserFromRequest(req?: Request) {
  const headerSessionId = req?.headers.get(SESSION_HEADER_NAME)?.trim() || null;

  if (headerSessionId) {
    const session = await getValidSessionById(headerSessionId);
    if (session) return session.user;
  }

  try {
    const cookieStore = await cookies();
    const cookieSessionId = cookieStore.get(COOKIE_NAME)?.value ?? null;

    if (!cookieSessionId) return null;

    const session = await getValidSessionById(cookieSessionId);
    return session?.user ?? null;
  } catch (err) {
    console.error("getUserFromRequest cookie fallback failed:", err);
    return null;
  }
}

export async function getUserFromSessionCookie() {
  return getUserFromRequest();
}

export async function revokeSessionFromRequest(req?: Request) {
  let sessionId = req?.headers.get(SESSION_HEADER_NAME)?.trim() || null;

  if (!sessionId) {
    try {
      const cookieStore = await cookies();
      sessionId = cookieStore.get(COOKIE_NAME)?.value ?? null;
    } catch {
      // ignore
    }
  }

  if (!sessionId) return;

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
    console.error("revokeSessionFromRequest failed:", err);
  }
}