import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionForUser } from "@/lib/auth";
import bs58 from "bs58";
import nacl from "tweetnacl";

type Body = {
  publicKey: string;      // base58 wallet address
  nonce: string;
  message: string;
  signature: number[];    // Uint8Array -> number[]
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const walletAddress = (body.publicKey || "").trim();
    const nonce = (body.nonce || "").trim();
    const message = body.message || "";
    const signatureArr = body.signature;

    if (!walletAddress || !nonce || !message || !Array.isArray(signatureArr)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // 1) Confirm nonce exists in DB for this wallet (prevents replay)
    const nonceRow = await prisma.walletNonce.findFirst({
      where: { walletAddress, nonce },
    });

    if (!nonceRow) {
      return NextResponse.json(
        { error: "Invalid or expired nonce. Please try again." },
        { status: 401 }
      );
    }

    // 2) Basic sanity: ensure message includes wallet + nonce
    // (helps prevent signing some other message)
    if (!message.includes(walletAddress) || !message.includes(nonce)) {
      return NextResponse.json({ error: "Message mismatch" }, { status: 400 });
    }

    // 3) Verify signature (ed25519)
    const publicKeyBytes = bs58.decode(walletAddress);
    const signatureBytes = Uint8Array.from(signatureArr);
    const messageBytes = new TextEncoder().encode(message);

    const ok = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4) One-time use: delete the nonce now that it’s been used successfully
    await prisma.walletNonce.deleteMany({ where: { walletAddress } });

    // 5) Find or create wallet + user
    // If wallet already linked, reuse its user.
    let wallet = await prisma.wallet.findUnique({ where: { address: walletAddress } });

    let userId: string;

    if (wallet?.userId) {
      userId = wallet.userId;
    } else {
      // Create a new user (later, if you add email login, you will connect to existing user instead)
      const user = await prisma.user.create({ data: {} });
      userId = user.id;

      // Create or update wallet to point to this user
      wallet = await prisma.wallet.upsert({
        where: { address: walletAddress },
        update: { userId },
        create: { address: walletAddress, userId },
      });
    }

    // 6) Mark wallet verified
    await prisma.wallet.update({
      where: { address: walletAddress },
      data: {
        verified: true,
        verifiedAt: new Date(),
      },
    });

    // 7) ✅ Issue session cookie (server sets HttpOnly cookie)
    await createSessionForUser(userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wallet/verify error:", err);
    return NextResponse.json({ error: "Verify failed" }, { status: 500 });
  }
}
