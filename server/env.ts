import { z } from 'zod';

const schema = z.object({
	// NORG's office registry, without the /norg2 path
	NORG2_ORIGIN: z.url(),
	// PDL's GraphQL API, without the /graphql path
	PDL_ORIGIN: z.url(),
	// The audience of PDL's tokens, e.g. api://dev-fss.pdl.pdl-api/.default
	PDL_TOKEN_TARGET: z.string().min(1),
	// Texas, NAIS's token service. NAIS injects it for azure.application
	NAIS_TOKEN_ENDPOINT: z.url(),
	// Locally, a token for PDL instead of asking Texas
	PDL_DEVELOPMENT_TOKEN: z.string().min(1).optional(),
	PORT: z.coerce.number().int().positive().default(3003),
});

export const parseEnv = (source: Record<string, string | undefined>) => {
	const parsed = schema.safeParse(source);

	if (!parsed.success) {
		throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
	}

	return parsed.data;
};

// Read when the server starts, so a misconfigured pod crashes before it takes traffic
export const env = parseEnv(process.env);
