import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "echo_session";

function newSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

type Body = {
  publicKey: string;
  nonce: string;
  message: string;
  signature: number[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const walletAddress = body.publicKey.trim();
    const nonce = body.nonce.trim();
    const message = body.message;
    const signatureArr = body.signature;

    const nonceRow = await prisma.walletNonce.findFirst({
      where: { walletAddress, nonce },
    });

    if (!nonceRow) {
      return NextResponse.json(
        { ok: false, error: "Invalid nonce" },
        { status: 401 }
      );
    }

    const publicKeyBytes = bs58.decode(walletAddress);
    const signatureBytes = Uint8Array.from(signatureArr);
    const messageBytes = new TextEncoder().encode(message);

    const valid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!valid) {
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
      const user = await prisma.user.create({ data: {} });

      userId = user.id;

      wallet = await prisma.wallet.create({
        data: {
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

    const sessionId = newSessionId();
    const maxAge = 60 * 60 * 24 * 30;

    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        expiresAt: new Date(Date.now() + maxAge * 1000),
      },
    });

    const response = NextResponse.json({
      ok: true,
      walletAddress,
    });

    response.headers.append(
      "Set-Cookie",
      `${COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure; HttpOnly`
    );

    return response;
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { ok: false, error: "Verify failed" },
      { status: 500 }
    );
  }
}