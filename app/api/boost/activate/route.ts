
import { NextRequest, NextResponse } from 'next/server';
import { EchoEngine } from '@/lib/engine';

export async function POST(req: NextRequest) {
  try {
    const { state } = await req.json();
    const now = Date.now();
    const newState = EchoEngine.addAdBoost(state, now);
    return NextResponse.json(newState);
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 400 });
  }
}
