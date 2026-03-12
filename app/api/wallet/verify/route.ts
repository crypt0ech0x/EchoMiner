// app/api/wallet/verify/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const publicKey = String(body.publicKey ?? "").trim();
    const nonce = String(body.nonce ?? "").trim();
    const message = String(body.message ?? "");
    const signature = body.signature;

    if (!publicKey || !nonce || !message || !Array.isArray(signature)) {
      return NextResponse.json(
        { error: "Invalid verification payload" },
        { status: 400 }
      );
    }

    const storedNonce = await prisma.walletNonce.findFirst({
      where: { nonce },
      orderBy: { createdAt: "desc" },
    });

    if (!storedNonce) {
      return NextResponse.json(
        { error: "Nonce not found or expired" },
        { status: 400 }
      );
    }

    if (storedNonce.walletAddress !== publicKey) {
      return NextResponse.json(
        { error: "Wallet mismatch for nonce" },
        { status: 400 }
      );
    }

    const encodedMessage = new TextEncoder().encode(message);
    const sig = new Uint8Array(signature);
    const pubKey = bs58.decode(publicKey);

    const verified = nacl.sign.detached.verify(encodedMessage, sig, pubKey);

    if (!verified) {
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 401 }
      );
    }

    await prisma.walletNonce.deleteMany({
      where: {
        walletAddress: publicKey,
        nonce,
      },
    });

    const existingWallet = await prisma.wallet.findUnique({
      where: { address: publicKey },
      include: { user: true },
    });

    let userId: string;

    if (!existingWallet?.userId) {
      const user = await prisma.user.create({
        data: {},
      });

      userId = user.id;

      await prisma.wallet.upsert({
        where: { address: publicKey },
        update: {
          userId,
          verified: true,
          verifiedAt: new Date(),
        },
        create: {
          address: publicKey,
          userId,
          verified: true,
          verifiedAt: new Date(),
        },
      });
    } else {
      userId = existingWallet.userId;

      await prisma.wallet.update({
        where: { address: publicKey },
        data: {
          verified: true,
          verifiedAt: new Date(),
        },
      });
    }

    const sessionId = crypto.randomUUID();

    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const cookieStore = await cookies();

    cookieStore.set("echo_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      walletAddress: publicKey,
    });
  } catch (err: any) {
    console.error("wallet verify error:", err);

    return NextResponse.json(
      {
        error: err?.message || "Wallet verification failed",
      },
      { status: 500 }
    );
  }
}