// app/api/wallet/verify/route.ts
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const walletAddress = (body?.publicKey || "").trim();
    const nonce = (body?.nonce || "").trim();
    const message = body?.message || "";
    const signatureArr = body?.signature;

    if (!walletAddress || !nonce || !message || !Array.isArray(signatureArr)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const nonceRow = await prisma.walletNonce.findFirst({
      where: { walletAddress, nonce },
    });
    if (!nonceRow) {
      return NextResponse.json({ error: "Invalid or expired nonce. Try again." }, { status: 401 });
    }

    if (!message.includes(walletAddress) || !message.includes(nonce)) {
      return NextResponse.json({ error: "Message mismatch" }, { status: 400 });
    }

    const publicKeyBytes = bs58.decode(walletAddress);
    const signatureBytes = Uint8Array.from(signatureArr);
    const messageBytes = new TextEncoder().encode(message);

    const ok = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    await prisma.walletNonce.deleteMany({ where: { walletAddress } });

    // Find/create wallet + user
    let wallet = await prisma.wallet.findUnique({ where: { address: walletAddress } });

    let userId: string;
    if (wallet?.userId) {
      userId = wallet.userId;
    } else {
      const user = await prisma.user.create({ data: {} });
      userId = user.id;

      wallet = await prisma.wallet.upsert({
        where: { address: walletAddress },
        update: { userId },
        create: { address: walletAddress, userId },
      });
    }

    await prisma.wallet.update({
      where: { address: walletAddress },
      data: { verified: true, verifiedAt: new Date() },
    });

    await createSessionForUser(userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wallet/verify error:", err);
    return NextResponse.json({ error: "Verify failed" }, { status: 500 });
  }
}