
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { itemId } = await req.json();
  const sessionId = 'cs_test_' + Math.random().toString(36).substring(7);
  return NextResponse.json({ sessionId });
}
