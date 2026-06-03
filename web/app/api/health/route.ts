import { NextResponse } from 'next/server';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://api:3001';
const realtimeUrl = process.env.REALTIME_INTERNAL_URL ?? 'http://realtime:3002';

export async function GET() {
  const results: {
    name: string;
    status: string;
    instance?: string;
    connections?: number;
  }[] = [];

  try {
    const apiRes = await fetch(`${apiUrl}/health/live`, { cache: 'no-store' });
    if (apiRes.ok) {
      const data = await apiRes.json();
      results.push({ name: 'API', status: 'live', instance: data.instance });
    }
  } catch {
    results.push({ name: 'API', status: 'unreachable' });
  }

  try {
    const rtRes = await fetch(`${realtimeUrl}/health/live`, { cache: 'no-store' });
    if (rtRes.ok) {
      const data = await rtRes.json();
      results.push({
        name: 'Realtime',
        status: 'live',
        instance: data.instance,
        connections: data.connections,
      });
    }
  } catch {
    results.push({ name: 'Realtime', status: 'unreachable' });
  }

  results.push({ name: 'Nginx edge', status: 'proxy' });
  results.push({ name: 'Ingest-1', status: 'rtmp:19351' });
  results.push({ name: 'Ingest-2', status: 'rtmp:19352' });

  return NextResponse.json(results);
}
