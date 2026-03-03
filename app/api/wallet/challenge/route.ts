// app/api/wallet/challenge/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { walletAddress: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const walletAddress = (body?.walletAddress || "").trim();

    if (!walletAddress) {
      return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });
    }

    const nonce = crypto.randomBytes(16).toString("hex");

    await prisma.walletNonce.deleteMany({ where: { walletAddress } });
    await prisma.walletNonce.create({ data: { walletAddress, nonce } });

    return NextResponse.json({ nonce });
  } catch (err) {
    console.error("wallet/challenge error:", err);
    return NextResponse.json({ error: "Challenge failed" }, { status: 500 });
  }
}