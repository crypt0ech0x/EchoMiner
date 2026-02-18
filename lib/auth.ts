import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "echo_session";
const SESSION_DAYS = 14;

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function createSessionForUser(userId: string) {
  const token = crypto.randomBytes(32).toString("hex"); // raw cookie token
  const tokenHash = sha256(token); // stored in DB
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: tokenHash, // override default cuid()
      userId,
      expiresAt,
    },
  });

  cookies().set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { expiresAt };
}

export async function getUserFromSessionCookie() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);

  const session = await prisma.session.findUnique({
    where: { id: tokenHash },
    include: { user: { include: { wallet: true } } },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  return session.user;
}
