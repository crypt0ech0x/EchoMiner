import { NextResponse } from "next/server";

export async function POST() {
  // In production: store this nonce in DB/session tied to the user.
  // For MVP: return a random nonce; still blocks dumb replay attacks.
  const nonce = crypto.randomUUID();
  return NextResponse.json({ nonce });
}
