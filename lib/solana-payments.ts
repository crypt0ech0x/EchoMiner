// lib/solana-payments.ts
import "server-only";
import {
  Connection,
  Finality,
  LAMPORTS_PER_SOL,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  PublicKey,
} from "@solana/web3.js";

function getRpcUrl() {
  const url = process.env.SOLANA_RPC_URL?.trim();
  if (!url) {
    throw new Error("Missing SOLANA_RPC_URL");
  }
  return url;
}

function getFinality(): Finality {
  const value = (process.env.SOLANA_COMMITMENT || "finalized").trim();

  if (value === "processed" || value === "confirmed" || value === "finalized") {
    return value;
  }

  return "finalized";
}

export function getSolanaConnection() {
  return new Connection(getRpcUrl(), getFinality());
}

export function getTreasuryWalletAddress() {
  const raw = process.env.SOL_TREASURY_WALLET?.trim();
  if (!raw) {
    throw new Error("Missing SOL_TREASURY_WALLET");
  }
  return new PublicKey(raw).toBase58();
}

export function solToLamports(solAmount: number) {
  return Math.round(solAmount * LAMPORTS_PER_SOL);
}

export type VerifiedSolPayment = {
  ok: true;
  slot: number;
  blockTime: number | null;
};

export type FailedSolPayment = {
  ok: false;
  error: string;
};

function isParsedInstruction(
  ix: ParsedInstruction | PartiallyDecodedInstruction
): ix is ParsedInstruction {
  return "parsed" in ix;
}

export async function verifySolTransfer(args: {
  signature: string;
  expectedSender: string;
  expectedRecipient: string;
  expectedLamports: number;
}): Promise<VerifiedSolPayment | FailedSolPayment> {
  try {
    const connection = getSolanaConnection();

    const tx = await connection.getParsedTransaction(args.signature, {
      commitment: getFinality(),
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { ok: false, error: "Transaction not found" };
    }

    if (tx.meta?.err) {
      return { ok: false, error: "Transaction failed on chain" };
    }

    const instructions = tx.transaction.message.instructions ?? [];
    let matched = false;

    for (const ix of instructions) {
      if (!isParsedInstruction(ix)) continue;
      if (ix.program !== "system") continue;

      const parsed = ix.parsed as any;
      if (!parsed?.type || parsed.type !== "transfer") continue;

      const info = parsed.info ?? {};
      const source = String(info.source ?? "");
      const destination = String(info.destination ?? "");
      const lamports = Number(info.lamports ?? 0);

      if (
        source === args.expectedSender &&
        destination === args.expectedRecipient &&
        lamports === args.expectedLamports
      ) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return {
        ok: false,
        error: "No matching SOL transfer found in transaction",
      };
    }

    return {
      ok: true,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
    };
  } catch (err) {
    console.error("verifySolTransfer error:", err);
    return {
      ok: false,
      error: "Failed to verify transaction",
    };
  }
}