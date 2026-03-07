// app/api/wallet/verify/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { publicKey } = body;

    if (!publicKey) {
      return NextResponse.json(
        { ok: false, error: "Missing wallet address" },
        { status: 400 }
      );
    }

    // Find wallet
    let wallet = await prisma.wallet.findUnique({
      where: { address: publicKey },
      include: { user: true },
    });

    // Create user if wallet not found
    if (!wallet) {
      const user = await prisma.user.create({
        data: {
          email: `${publicKey}@wallet.echo`,
        },
      });

      wallet = await prisma.wallet.create({
        data: {
          address: publicKey,
          verified: true,
          verifiedAt: new Date(),
          userId: user.id,
        },
        include: { user: true },
      });
    }

    // Mark wallet verified
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        verified: true,
        verifiedAt: new Date(),
      },
    });

    // 🔥 THIS IS THE IMPORTANT PART
    await createSessionCookie(wallet.user.id);

    return NextResponse.json({
      ok: true,
      walletAddress: wallet.address,
    });
  } catch (err) {
    console.error("wallet verify error:", err);

    return NextResponse.json(
      { ok: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}