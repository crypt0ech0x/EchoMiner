import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionForUser } from "@/lib/auth";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  publicKey: string;   // base58 wallet address
  nonce: string;
  message: string;
  signature: number[]; // Uint8Array -> number[]
};

const NONCE_TTL_MINUTES = 10;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// IMPORTANT: This must match what the client signs
function buildExpectedMessage(walletAddress: string, nonce: string) {
  return (
    `ECHO Wallet Verification\n` +
    `Wallet: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `\nBy signing this message, you verify ownership for ECHO airdrop eligibility.`
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;

    const walletAddress = (body?.publicKey || "").trim();
    const nonce = (body?.nonce || "").trim();
    const message = body?.message || "";
    const signatureArr = body?.signature;

    if (!walletAddress || !nonce || !message || !Array.isArray(signatureArr)) {
      return json({ ok: false, error: "Missing fields" }, 400);
    }

    // Validate signature array
    if (signatureArr.length !== 64) {
      return json({ ok: false, error: "Invalid signature length" }, 400);
    }

    // Validate base58 pubkey decodes to 32 bytes
    let publicKeyBytes: Uint8Array;
    try {
      publicKeyBytes = bs58.decode(walletAddress);
    } catch {
      return json({ ok: false, error: "Invalid publicKey" }, 400);
    }
    if (publicKeyBytes.length !== 32) {
      return json({ ok: false, error: "Invalid publicKey bytes" }, 400);
    }

    // Nonce must exist, and not be expired
    const now = new Date();
    const cutoff = new Date(now.getTime() - NONCE_TTL_MINUTES * 60 * 1000);

    const nonceRow = await prisma.walletNonce.findFirst({
      where: {
        walletAddress,
        nonce,
        createdAt: { gte: cutoff },
      },
    });

    if (!nonceRow) {
      return json(
        { ok: false, error: "Invalid or expired nonce. Please try again." },
        401
      );
    }

    // Verify message matches exactly what we expect (prevents signing random strings)
    const expected = buildExpectedMessage(walletAddress, nonce);
    if (message !== expected) {
      return json({ ok: false, error: "Message mismatch" }, 400);
    }

    // Verify signature
    const signatureBytes = Uint8Array.from(signatureArr);
    const messageBytes = new TextEncoder().encode(message);

    const ok = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!ok) {
      return json({ ok: false, error: "Invalid signature" }, 401);
    }

    // Success: one-time nonce use
    // Then create/link user+wallet, mark verified, create session cookie
    const result = await prisma.$transaction(async (tx) => {
      // Consume nonce(s) for this wallet (one-time use)
      await tx.walletNonce.deleteMany({ where: { walletAddress } });

      // Find wallet
      let wallet = await tx.wallet.findUnique({ where: { address: walletAddress } });

      let userId: string;

      if (wallet?.userId) {
        userId = wallet.userId;
      } else {
        // Create user first
        const user = await tx.user.create({ data: {} });
        userId = user.id;

        // Upsert wallet and attach
        wallet = await tx.wallet.upsert({
          where: { address: walletAddress },
          update: { userId },
          create: { address: walletAddress, userId },
        });
      }

      // Mark verified
      await tx.wallet.update({
        where: { address: walletAddress },
        data: { verified: true, verifiedAt: new Date() },
      });

      return { userId };
    });

    // Set session cookie (httpOnly)
    await createSessionForUser(result.userId);

    return json({ ok: true });
  } catch (err) {
    console.error("wallet/verify error:", err);
    return json({ ok: false, error: "Verify failed" }, 500);
  }
}

export async function GET() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}