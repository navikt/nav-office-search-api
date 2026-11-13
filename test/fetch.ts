import { mockFetch } from '@itsy/corgi/testing';
import { afterEach, beforeAll, beforeEach } from 'vitest';

// corgi's mock as the test file's global fetch, cleared before each test. A call to a URL without a
// route fails the test, even if the code under test swallowed it as a failed request
export const installMockFetch = () => {
	const http = mockFetch();
	beforeAll(() => http.install());
	beforeEach(() => http.reset());
	afterEach(() => {
		const unmatched = http.unmatchedCalls.map((call) => `${call.method} ${call.url}`);
		if (unmatched.length > 0) {
			throw new Error(`No mock route for ${unmatched.join(', ')}`);
		}
	});
	return http;
};
