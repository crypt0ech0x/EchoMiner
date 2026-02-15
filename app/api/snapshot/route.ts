
import { NextRequest, NextResponse } from 'next/server';
import { EchoEngine } from '@/lib/engine';

export async function POST(req: NextRequest) {
  const { state } = await req.json();
  const csv = EchoEngine.getSnapshotCSV(state);
  return NextResponse.json({ csv });
}
