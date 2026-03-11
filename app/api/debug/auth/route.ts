// app/api/debug/auth/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME = "echo_session";
const TEST_COOKIE_NAME = "echo_cookie_test";

export async function GET() {
  try {
    const cookieStore = await cookies();

    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    const testCookie = cookieStore.get(TEST_COOKIE_NAME)?.value ?? null;

    let session = null;
    if (sessionCookie) {
      try {
        session = await prisma.session.findUnique({
          where: { id: sessionCookie },
          include: {
            user: {
              include: {
                wallet: true,
              },
            },
          },
        });
      } catch (err: any) {
        return NextResponse.json({
          ok: false,
          sessionCookiePresent: !!sessionCookie,
          testCookiePresent: !!testCookie,
          sessionId: sessionCookie,
          prismaError: err?.message ?? "Unknown Prisma error",
        });
      }
    }

    const authedUser = await getUserFromSessionCookie();

    return NextResponse.json({
      ok: true,
      sessionCookiePresent: !!sessionCookie,
      testCookiePresent: !!testCookie,
      sessionId: sessionCookie,
      testCookieValue: testCookie,
      sessionFound: !!session,
      sessionRevokedAt: session?.revokedAt?.toISOString?.() ?? null,
      sessionExpiresAt: session?.expiresAt?.toISOString?.() ?? null,
      userIdFromSession: session?.userId ?? null,
      walletFromSession: session?.user?.wallet?.address ?? null,
      authedUserId: authedUser?.id ?? null,
      authedWallet: authedUser?.wallet?.address ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Debug route failed",
      },
      { status: 500 }
    );
  }
}