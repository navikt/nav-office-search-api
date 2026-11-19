import { isHttpError, isTimeoutError } from '@itsy/corgi';
import { schema, type StandardSchemaV1 } from '@itsy/corgi/schema';
import { logger } from '@navikt/navno-logger';
import { failureOf } from '@navikt/navno-server/upstream';
import { z } from 'zod';
import { env } from '../env.ts';
import { recordPdlErrors } from '../metrics.ts';
import { REQUEST_TIMEOUT_MS, upstreamClient } from '../upstream.ts';
import { freshPdlToken, pdlToken, TokenError } from './token.ts';

const pdlGraphQLUrl = `${env.PDL_ORIGIN}/graphql`;

const pdl = upstreamClient('pdl', { timeout: REQUEST_TIMEOUT_MS, headers: { accept: 'application/json' } });

export type Failure = { error: true; statusCode: number; message: string };

const failure = (statusCode: number, message: string): Failure => ({ error: true, statusCode, message });

// PDL answered, with GraphQL errors.
// Codes only: messages can have the query in them, with what was searched for.
class PdlErrors extends Error {
	codes: string[];

	constructor(codes: string[]) {
		super('PDL answered with errors');
		this.codes = codes;
	}
}

const errorsSchema = z.object({
	errors: z.array(z.looseObject({ extensions: z.looseObject({ code: z.unknown() }).nullish() })),
});

// The codes of the GraphQL errors in an answer from PDL. None when it has no errors, or isn't a GraphQL answer.
const errorCodesOf = (answer: unknown) => {
	const parsed = errorsSchema.safeParse(answer);
	return parsed.success
		? parsed.data.errors.map(({ extensions }) => (typeof extensions?.code === 'string' ? extensions.code : 'unknown'))
		: [];
};

// PDL reports a token it won't take as HTTP 401, or as a GraphQL error on HTTP 200
const isRefusedToken = (e: unknown) =>
	(isHttpError(e) && e.status === 401) || (e instanceof PdlErrors && e.codes.includes('unauthenticated'));

// What to log about a failed lookup: a status and PDL's error codes, never our request or PDL's own words
const logFailure = (e: unknown) => {
	if (e instanceof TokenError) {
		logger.error('Token request for PDL failed', failureOf(e.cause));
	} else if (e instanceof PdlErrors) {
		logger.error('PDL request failed', { status: 200, errorCodes: e.codes });
	} else if (isHttpError(e)) {
		logger.error('PDL request failed', { status: e.status, errorCodes: errorCodesOf(e.data) });
	} else {
		logger.error('PDL request failed', failureOf(e));
	}
};

/**
 * One GraphQL query to PDL: the `data` of its answer, checked against the schema, or the failure to answer the
 * caller with. The token, the query and a second try share one deadline, so the answer comes before
 * nav-office-search gives up. When PDL refuses the token, the query is tried once more with a new one.
 */
export const pdlQuery = async <Schema extends StandardSchemaV1>(
	query: string,
	variables: Record<string, unknown>,
	dataSchema: Schema
): Promise<Awaited<StandardSchemaV1.InferOutput<Schema>> | Failure> => {
	const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

	const ask = async (token: string) => {
		try {
			return await pdl.post(pdlGraphQLUrl, {
				body: { query, variables },
				headers: { authorization: `Bearer ${token}` },
				signal,
				// The errors first: an answer with errors can have data too, and isn't to be trusted
				transform: (answer) => {
					const codes = errorCodesOf(answer);
					if (codes.length > 0) {
						throw new PdlErrors(codes);
					}
					return schema(dataSchema)((answer as { data?: unknown } | null)?.data);
				},
			});
		} catch (e) {
			let codes: string[] = [];
			if (e instanceof PdlErrors) {
				codes = e.codes;
			} else if (isHttpError(e)) {
				codes = errorCodesOf(e.data);
			}
			recordPdlErrors(codes);
			throw e;
		}
	};

	try {
		try {
			return await ask(await pdlToken(signal));
		} catch (e) {
			const freshToken = isRefusedToken(e) ? await freshPdlToken(signal) : undefined;
			if (!freshToken) {
				throw e;
			}

			logger.warn('PDL refused the token, trying once more with a new one');
			return await ask(freshToken);
		}
	} catch (e) {
		logFailure(e);
		const cause = e instanceof TokenError ? e.cause : e;
		return isTimeoutError(cause) ? failure(504, 'PDL request timed out') : failure(502, 'PDL request failed');
	}
};
