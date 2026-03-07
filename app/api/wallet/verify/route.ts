// app/api/wallet/verify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionForUser } from "@/lib/auth";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  publicKey: string;
  nonce: string;
  message: string;
  signature: number[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const walletAddress = (body.publicKey || "").trim();
    const nonce = (body.nonce || "").trim();
    const message = body.message || "";
    const signatureArr = body.signature;

    if (!walletAddress || !nonce || !message || !Array.isArray(signatureArr)) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const nonceRow = await prisma.walletNonce.findFirst({
      where: { walletAddress, nonce },
    });

    if (!nonceRow) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired nonce. Please try again." },
        { status: 401 }
      );
    }

    if (!message.includes(walletAddress) || !message.includes(nonce)) {
      return NextResponse.json(
        { ok: false, error: "Message mismatch" },
        { status: 400 }
      );
    }

    const publicKeyBytes = bs58.decode(walletAddress);
    const signatureBytes = Uint8Array.from(signatureArr);
    const messageBytes = new TextEncoder().encode(message);

    const ok = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Invalid signature" },
        { status: 401 }
      );
    }

    await prisma.walletNonce.deleteMany({
      where: { walletAddress },
    });

    let wallet = await prisma.wallet.findUnique({
      where: { address: walletAddress },
    });

    let userId: string;

    if (wallet?.userId) {
      userId = wallet.userId;
    } else {
      const user = await prisma.user.create({
        data: {},
      });

      userId = user.id;

      wallet = await prisma.wallet.upsert({
        where: { address: walletAddress },
        update: { userId },
        create: {
          address: walletAddress,
          userId,
        },
      });
    }

    await prisma.wallet.update({
      where: { address: walletAddress },
      data: {
        verified: true,
        verifiedAt: new Date(),
      },
    });

    const { sessionId, maxAgeSeconds } = await createSessionForUser(userId);

    const response = NextResponse.json({
      ok: true,
      walletAddress,
    });

    attachSessionCookie(response, sessionId, { maxAgeSeconds });

    return response;
  } catch (err) {
    console.error("wallet/verify error:", err);
    return NextResponse.json(
      { ok: false, error: "Verify failed" },
      { status: 500 }
    );
  }
}