import { config } from '../config.js';
import { getIngestLoad } from '../redis.js';
import { listServiceInstances } from './registry.js';

async function probeIngestNode(node: string): Promise<{
  node: string;
  reachable: boolean;
  activeStreams: number;
}> {
  const activeStreams = await getIngestLoad(node);
  try {
    const res = await fetch(`http://${node}:8888/`, {
      signal: AbortSignal.timeout(2000),
    });
    return { node, reachable: res.ok || res.status < 500, activeStreams };
  } catch {
    return { node, reachable: false, activeStreams };
  }
}

export async function getPlatformTopology() {
  const [apiInstances, realtimeInstances, ingestNodes] = await Promise.all([
    listServiceInstances('api'),
    listServiceInstances('realtime'),
    Promise.all(config.ingestNodes.map(probeIngestNode)),
  ]);

  const reachableIngest = ingestNodes.filter((n) => n.reachable);

  let totalWsConnections = 0;
  for (const { meta } of realtimeInstances) {
    const c = meta.connections;
    if (typeof c === 'number') totalWsConnections += c;
  }

  return {
    api: {
      replicas: apiInstances.length,
      instances: apiInstances.map(({ instance, meta }) => ({
        instance,
        uptime: meta.uptime,
      })),
    },
    realtime: {
      replicas: realtimeInstances.length,
      totalConnections: totalWsConnections,
      instances: realtimeInstances.map(({ instance, meta }) => ({
        instance,
        uptime: meta.uptime,
        connections: meta.connections,
      })),
    },
    ingest: {
      configured: config.ingestNodes,
      poolSize: reachableIngest.length,
      configuredSize: config.ingestNodes.length,
      nodes: ingestNodes,
    },
  };
}
