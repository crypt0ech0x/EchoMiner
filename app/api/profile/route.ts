
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest) {
  const { state, pfpUrl, username } = await req.json();
  
  if (pfpUrl) state.user.pfpUrl = pfpUrl;
  if (username) state.user.username = username;

  return NextResponse.json(state);
}
