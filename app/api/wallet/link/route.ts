
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { address } = await req.json();
  // Here we would typically verify a signature using @solana/web3.js and nacl
  // For this mock, we assume verification succeeded.
  return NextResponse.json({ ok: true });
}
