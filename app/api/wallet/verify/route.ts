import { NextResponse } from "next/server";
import nacl from "tweetnacl";

type Body = {
  publicKey: string;
  nonce: string;
  message: string;
  signature: number[]; // Uint8Array serialized
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { publicKey, nonce, message, signature } = body;

    if (!publicKey || !nonce || !message || !signature?.length) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }

    // IMPORTANT: In production you must verify that the nonce is the one you issued for this user
    // (DB/session). Otherwise someone could reuse old signed messages.
    // This MVP assumes nonce is fresh.

    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = Uint8Array.from(signature);

    // Solana public keys are base58
    const bs58 = (await import("bs58")).default;
    const pubKeyBytes = bs58.decode(publicKey);

    const ok = nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

    if (!ok) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    // TODO (production): bind publicKey to the authenticated user in your database
    // and mark walletVerified=true.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
