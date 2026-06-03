export const config = {
  port: Number(process.env.PORT ?? 3001),
  hostname: process.env.HOSTNAME ?? 'api-local',
  postgresUrl:
    process.env.DATABASE_URL ??
    'postgres://aruna:aruna@postgres:5432/aruna',
  redisUrl: process.env.REDIS_URL ?? 'redis://redis:6379',
  ingestNodes: (process.env.INGEST_NODES ?? 'ingest-1,ingest-2')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean),
  rtmpPort: Number(process.env.RTMP_PORT ?? 1935),
  hlsBaseUrl: process.env.HLS_BASE_URL ?? 'http://localhost:8080/hls',
  publicRtmpHost: process.env.PUBLIC_RTMP_HOST ?? 'localhost',
  publicRtmpPorts: (process.env.PUBLIC_RTMP_PORTS ?? '19351,19352')
    .split(',')
    .map((p) => Number(p.trim())),
  internalApiKey: process.env.INTERNAL_API_KEY ?? 'dev-internal-key',
};
