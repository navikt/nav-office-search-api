import { schema } from '@itsy/corgi/schema';
import { z } from 'zod';
import { env } from '../env.ts';
import { REQUEST_TIMEOUT_MS, upstreamClient } from '../upstream.ts';

const texas = upstreamClient('texas', { timeout: REQUEST_TIMEOUT_MS });

const tokenSchema = z.looseObject({ access_token: z.string().min(1) });

// Texas gave no token. `cause` is what happened.
export class TokenError extends Error {}

const askTexas = async (signal: AbortSignal, skipCache: boolean) => {
	try {
		const { access_token } = await texas.post(env.NAIS_TOKEN_ENDPOINT, {
			body: { identity_provider: 'entra_id', target: env.PDL_TOKEN_TARGET, ...(skipCache && { skip_cache: true }) },
			signal,
			transform: schema(tokenSchema),
		});
		return access_token;
	} catch (e) {
		throw new TokenError('Texas gave no token for PDL', { cause: e });
	}
};

// The token for a PDL request. Texas keeps the token itself and never hands out an expired one, so it is asked every
// time and nothing is kept here.
export const pdlToken = (signal: AbortSignal) =>
	env.PDL_DEVELOPMENT_TOKEN ? Promise.resolve(env.PDL_DEVELOPMENT_TOKEN) : askTexas(signal, false);

const FORCED_TOKEN_INTERVAL_MS = 60_000;
let forcedTokenAt = -Infinity;

// A token Texas hasn't kept, for when PDL refused the one it had. At most one a minute for the whole process, so a PDL
// that keeps refusing doesn't turn every lookup into a request to Entra ID. Undefined when one was just made, and
// with a development token, which there is only one of.
export const freshPdlToken = async (signal: AbortSignal) => {
	if (env.PDL_DEVELOPMENT_TOKEN || Date.now() - forcedTokenAt < FORCED_TOKEN_INTERVAL_MS) {
		return undefined;
	}

	forcedTokenAt = Date.now();
	return askTexas(signal, true);
};
