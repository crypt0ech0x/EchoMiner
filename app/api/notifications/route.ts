
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest) {
  const { state, id, all } = await req.json();
  const now = Date.now();

  if (all) {
    state.notifications.forEach((n: any) => { if (!n.readAt) n.readAt = now; });
  } else if (id) {
    const notif = state.notifications.find((n: any) => n.id === id);
    if (notif) notif.readAt = now;
  }

  return NextResponse.json(state);
}

export async function DELETE(req: NextRequest) {
  const { state } = await req.json();
  state.notifications = [];
  return NextResponse.json(state);
}
