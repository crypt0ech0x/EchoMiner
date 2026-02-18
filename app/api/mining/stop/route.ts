import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Body = { walletAddress: string };

export async function POST(req: Request) {
  try {
    const { walletAddress } = (await req.json()) as Body;
    const addr = (walletAddress || "").trim();

    if (!addr) return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });

    const wallet = await prisma.wallet.findUnique({ where: { address: addr } });
    if (!wallet?.verified || !wallet.userId) {
      return NextResponse.json({ error: "Wallet not verified" }, { status: 401 });
    }

    const userId = wallet.userId;

    // Stop without accruing (you can call refresh right before stop in UI)
    await prisma.miningSession.update({
      where: { userId },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("mining/stop error:", err);
    return NextResponse.json({ error: "Stop failed" }, { status: 500 });
  }
}
