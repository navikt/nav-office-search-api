import { corgi, type CorgiOptions, isHttpError, ORDER, order, type Plugin } from '@itsy/corgi';
import { isValidationError, type StandardSchemaV1 } from '@itsy/corgi/schema';
import { withTimeout } from '@itsy/corgi/timeout';
import { observeUpstream, type Upstream } from './metrics.ts';

// For a request made while a caller waits. nav-office-search gives up after 5 s, so an answer has to come sooner.
export const REQUEST_TIMEOUT_MS = 4000;

// Counts and times each request, just outside its deadline, so one that times out is counted too
const observe = (upstream: Upstream): Plugin =>
	order(ORDER.timeout - 1, (next) => (url, init) => observeUpstream(upstream, () => next(url, init)));

type UpstreamOptions = CorgiOptions & {
	// Gives up on a request after this long, reading its body included
	timeout: number;
};

// A corgi client for one upstream, counted in the metrics under its name. It throws when the upstream doesn't answer
// 2xx in time, and when an answer fails its schema.
export const upstreamClient = (upstream: Upstream, { timeout, plugins = [], ...defaults }: UpstreamOptions) =>
	corgi.create({ ...defaults, plugins: [...plugins, observe(upstream), withTimeout(timeout)] });

const pathOf = (path: StandardSchemaV1.Issue['path'] = []) =>
	path.map((segment) => String(typeof segment === 'object' ? segment.key : segment)).join('.');

// What to log about a failed upstream request. Never an HttpError itself: its message and URL have the query, which
// can be what someone searched for.
export const failureOf = (error: unknown): object => {
	if (isHttpError(error)) {
		return { status: error.status };
	}
	if (isValidationError(error)) {
		return { issues: error.issues.slice(0, 3).map(({ path, message }) => `${pathOf(path)}: ${message}`) };
	}
	return error instanceof Error ? error : { error: String(error) };
};
