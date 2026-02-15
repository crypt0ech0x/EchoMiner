
import { NextRequest, NextResponse } from 'next/server';
import { EchoEngine } from '@/lib/engine';

export async function POST(req: NextRequest) {
  const { state } = await req.json();
  const now = Date.now();
  EchoEngine.processMaintenance(state, now);
  return NextResponse.json(state);
}
