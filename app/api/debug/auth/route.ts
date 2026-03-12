// app/api/debug/auth/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest, COOKIE_NAME, SESSION_HEADER_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value ?? null;
  const headerSessionId = req.headers.get(SESSION_HEADER_NAME)?.trim() ?? null;

  let headerSessionFound = false;
  if (headerSessionId) {
    const s = await prisma.session
      .findUnique({ where: { id: headerSessionId } })
      .catch(() => null);
    headerSessionFound = !!s;
  }

  const authedUser = await getUserFromRequest(req);

  return NextResponse.json({
    ok: true,
    sessionCookiePresent: !!sessionCookie,
    headerSessionPresent: !!headerSessionId,
    headerSessionId,
    headerSessionFound,
    authedUserId: authedUser?.id ?? null,
    authedWallet: authedUser?.wallet?.address ?? null,
  });
}