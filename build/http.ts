import { corgi } from '@itsy/corgi';
import { withRetry } from '@itsy/corgi/retry';
import { withTimeout } from '@itsy/corgi/timeout';

// What the build downloads with. An attempt gets 30 s, and a failed one is tried twice more, so that a moment's
// trouble at Bring or SSB doesn't fail a deploy.
export const downloader = (headers?: Record<string, string>) =>
	corgi.create({ headers, plugins: [withRetry(2), withTimeout(30_000)] });
