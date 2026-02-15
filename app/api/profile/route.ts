
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest) {
  const { state, pfpUrl, username } = await req.json();
  
  if (!state.user) return NextResponse.json({ message: "Invalid user state" }, { status: 400 });

  if (pfpUrl) state.user.pfpUrl = pfpUrl;
  
  if (username) {
    const normalized = username.trim();
    if (normalized.length < 3) return NextResponse.json({ message: "Username too short" }, { status: 400 });
    if (normalized.toLowerCase() === 'admin') return NextResponse.json({ message: "Name reserved" }, { status: 400 });
    state.user.username = normalized;
  }

  return NextResponse.json(state);
}
