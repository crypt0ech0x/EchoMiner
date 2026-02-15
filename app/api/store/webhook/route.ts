
import { NextRequest, NextResponse } from 'next/server';
import { EchoEngine } from '@/lib/engine';

export async function POST(req: NextRequest) {
  const { state, sessionId } = await req.json();
  const now = Date.now();
  
  // Initialize purchase history if it doesn't exist (safety check)
  if (!state.purchaseHistory) state.purchaseHistory = [];
  
  // For simulation, we assume any sessionId sent to this endpoint just succeeded
  // In a real app, this would be triggered by Stripe and we'd look up the item.
  // For this mock, we inject a dummy entry if it's not found
  const existing = state.purchaseHistory.find((h: any) => h.id === sessionId);
  if (!existing) {
    state.purchaseHistory.push({ id: sessionId, itemId: 'explorer_echo', timestamp: now, amount: 5.0, status: 'pending' });
  }

  const newState = EchoEngine.processPurchase(state, sessionId, now);
  return NextResponse.json(newState);
}
