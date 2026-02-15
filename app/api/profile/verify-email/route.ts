
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { state, email } = await req.json();
  
  if (state.user) {
    state.user.email = email;
    state.user.emailVerified = true;
  }

  return NextResponse.json(state);
}
