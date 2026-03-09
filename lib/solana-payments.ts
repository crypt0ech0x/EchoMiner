// lib/solana-payments.ts
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

function getRpcUrl() {
  const url = process.env.SOLANA_RPC_URL?.trim();
  if (!url) {
    throw new Error("Missing SOLANA_RPC_URL");
  }
  return url;
}

function getTreasuryWallet() {
  const value = process.env.SOL_TREASURY_WALLET?.trim();
  if (!value) {
    throw new Error("Missing SOL_TREASURY_WALLET");
  }
  return new PublicKey(value);
}

export function getSolanaConnection() {
  return new Connection(getRpcUrl(), "finalized");
}

export function solToLamports(solAmount: number) {
  return Math.round(solAmount * LAMPORTS_PER_SOL);
}

export function getTreasuryWalletAddress() {
  return getTreasuryWallet().toBase58();
}

export type VerifiedSolPayment = {
  ok: true;
  sender: string;
  recipient: string;
  lamports: number;
  signature: string;
  slot: number;
};

export type FailedSolPayment = {
  ok: false;
  error: string;
};

export async function verifySolTransfer(args: {
  signature: string;
  expectedSender: string;
  expectedRecipient: string;
  expectedLamports: number;
}): Promise<VerifiedSolPayment | FailedSolPayment> {
  try {
    const connection = getSolanaConnection();
    const tx = await connection.getTransaction(args.signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { ok: false, error: "Transaction not found" };
    }

    const recipient = args.expectedRecipient;
    const sender = args.expectedSender;

    const senderKey = new PublicKey(sender).toBase58();
    const recipientKey = new PublicKey(recipient).toBase58();

    const hasExpectedAccounts = tx.transaction.message.staticAccountKeys.some(
      (k) => k.toBase58() === senderKey
    ) &&
      tx.transaction.message.staticAccountKeys.some(
        (k) => k.toBase58() === recipientKey
      );

    if (!hasExpectedAccounts) {
      return { ok: false, error: "Transaction accounts do not match purchase wallet/treasury" };
    }

    const instructions = tx.transaction.message.compiledInstructions;
    const accountKeys = tx.transaction.message.staticAccountKeys;

    let foundTransfer = false;
    let matchedLamports = 0;

    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex]?.toBase58();
      if (programId !== SystemProgram.programId.toBase58()) continue;

      const accounts = ix.accountKeyIndexes.map((idx) => accountKeys[idx]?.toBase58());
      if (accounts.length < 2) continue;

      const from = accounts[0];
      const to = accounts[1];

      if (from !== senderKey || to !== recipientKey) continue;

      try {
        const raw = Buffer.from(ix.data);
        if (raw.length < 12) continue;

        const instructionType = raw.readUInt32LE(0);
        const lamports = Number(raw.readBigUInt64LE(4));

        // 2 = SystemProgram.transfer
        if (instructionType === 2) {
          foundTransfer = true;
          matchedLamports = lamports;
          break;
        }
      } catch {
        // ignore parse failures
      }
    }

    if (!foundTransfer) {
      return { ok: false, error: "No matching SOL transfer found in transaction" };
    }

    if (matchedLamports !== args.expectedLamports) {
      return {
        ok: false,
        error: `Incorrect payment amount. Expected ${args.expectedLamports} lamports, got ${matchedLamports}`,
      };
    }

    return {
      ok: true,
      sender: senderKey,
      recipient: recipientKey,
      lamports: matchedLamports,
      signature: args.signature,
      slot: tx.slot,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Failed to verify transaction",
    };
  }
}