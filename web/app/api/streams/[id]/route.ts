import { NextResponse } from 'next/server';
import { getStream } from '@/lib/api';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const stream = await getStream(id);
    return NextResponse.json(stream);
  } catch {
    return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
  }
}
