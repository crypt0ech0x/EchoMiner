// lib/ledger.ts
import { prisma } from "@/lib/prisma";

export async function addLedgerEntry(args: {
  userId: string;
  type:
    | "mining_accrual"
    | "session_settlement"
    | "purchase_credit"
    | "referral_bonus"
    | "leaderboard_reward"
    | "admin_adjustment"
    | "claim_deduction";
  amountEcho: number;
  sourceType?: string;
  sourceId?: string;
  metadataJson?: any;
}) {
  return prisma.ledgerEntry.create({
    data: {
      userId: args.userId,
      type: args.type,
      amountEcho: args.amountEcho,
      sourceType: args.sourceType ?? null,
      sourceId: args.sourceId ?? null,
      metadataJson: args.metadataJson ?? null,
    },
  });
}