import { NextResponse } from 'next/server';
import { getPlatformMetrics } from '@/lib/api';

export async function GET() {
  try {
    const metrics = await getPlatformMetrics();
    const scaling = metrics.scaling;
    const results: {
      name: string;
      status: string;
      instance?: string;
      connections?: number;
    }[] = [];

    if (scaling) {
      for (const inst of scaling.api.instances) {
        results.push({
          name: 'API',
          status: 'live',
          instance: inst.instance,
        });
      }
      if (scaling.api.replicas === 0) {
        results.push({ name: 'API', status: 'no replicas registered' });
      }

      for (const inst of scaling.realtime.instances) {
        results.push({
          name: 'Realtime',
          status: 'live',
          instance: inst.instance,
          connections: inst.connections,
        });
      }
      if (scaling.realtime.replicas === 0) {
        results.push({ name: 'Realtime', status: 'no replicas registered' });
      }

      for (const node of scaling.ingest.nodes) {
        results.push({
          name: `Ingest ${node.node}`,
          status: node.reachable ? 'reachable' : 'unreachable',
          instance: `${node.activeStreams} stream(s)`,
        });
      }
    }

    results.push({ name: 'Nginx edge', status: 'proxy' });

    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      [{ name: 'Platform', status: 'metrics unavailable' }],
      { status: 503 },
    );
  }
}
