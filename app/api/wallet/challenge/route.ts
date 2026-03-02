import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  walletAddress: string; // base58
};

const NONCE_TTL_MINUTES = 10;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const walletAddress = (body?.walletAddress || "").trim();

    if (!walletAddress) return json({ ok: false, error: "Missing walletAddress" }, 400);

    // Basic sanity: Solana pubkeys are typically 32 bytes base58 => ~43/44 chars
    if (walletAddress.length < 32 || walletAddress.length > 60) {
      return json({ ok: false, error: "Invalid walletAddress" }, 400);
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    const now = new Date();
    const cutoff = new Date(now.getTime() - NONCE_TTL_MINUTES * 60 * 1000);

    // Cleanup old nonces (global) + replace any existing for this wallet
    await prisma.$transaction([
      prisma.walletNonce.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.walletNonce.deleteMany({ where: { walletAddress } }),
      prisma.walletNonce.create({ data: { walletAddress, nonce } }),
    ]);

    return json({
      ok: true,
      nonce,
      expiresInSeconds: NONCE_TTL_MINUTES * 60,
    });
  } catch (err) {
    console.error("wallet/challenge error:", err);
    return json({ ok: false, error: "Challenge failed" }, 500);
  }
}

// Optional: block GET (helps avoid random browser hits)
export async function GET() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}