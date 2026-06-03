import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createStream, endStream, listStreams } from '@/lib/api';

async function usernameFromClerk() {
  const user = await currentUser();
  if (!user) return null;
  return (
    user.username ??
    user.firstName ??
    user.primaryEmailAddress?.emailAddress?.split('@')[0] ??
    user.id
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const liveOnly = searchParams.get('live') === 'true';
  const streams = await listStreams(liveOnly);
  return NextResponse.json(streams);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const username = await usernameFromClerk();
  if (!username) {
    return NextResponse.json({ error: 'User profile required' }, { status: 400 });
  }

  const body = (await req.json()) as { title?: string };
  const title = body.title?.trim() || `${username}'s stream`;

  const stream = await createStream(username, title);
  return NextResponse.json(stream, { status: 201 });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const username = await usernameFromClerk();
  const body = (await req.json()) as { id?: string };
  if (!body.id || !username) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const stream = await endStream(body.id, username);
  return NextResponse.json(stream);
}
