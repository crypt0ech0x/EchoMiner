// lib/auth.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

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

export function getSessionIdFromRequest(req: Request) {
  const raw = req.headers.get(SESSION_HEADER_NAME)?.trim();
  return raw || null;
}

export async function getSessionFromRequest(req: Request) {
  const sessionId = getSessionIdFromRequest(req);
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

    return session;
  } catch (err) {
    console.error("getSessionFromRequest failed:", err);
    return null;
  }
}

export async function getUserFromRequest(req: Request) {
  const session = await getSessionFromRequest(req);
  return session?.user ?? null;
}

export async function revokeSessionFromRequest(req: Request) {
  const sessionId = getSessionIdFromRequest(req);
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