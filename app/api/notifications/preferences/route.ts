
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest) {
  const { state, prefs } = await req.json();
  
  if (state.user) {
    state.user.notificationPreferences = prefs;
  }

  return NextResponse.json(state);
}
