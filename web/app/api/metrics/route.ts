import { NextResponse } from 'next/server';
import { getPlatformMetrics } from '@/lib/api';

export async function GET() {
  const metrics = await getPlatformMetrics();
  return NextResponse.json(metrics);
}
