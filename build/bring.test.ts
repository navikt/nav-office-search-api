import { isHttpError } from '@itsy/corgi';
import { describe, expect, test } from 'vitest';
import { installMockFetch } from '#test/fetch.ts';
import { bringRegister, bringRegisterUrl } from '#test/fixtures.ts';
import { fetchPostnrRegister, parsePostnrRegister } from './bring.ts';

const http = installMockFetch();

// A failure that tells the client to try again after a millisecond, instead of after its own backoff
const failure = (status: number) => ({ status, headers: { 'retry-after': '0.001' } });

describe('parsePostnrRegister', () => {
	test('reads one row per line', () => {
		expect(parsePostnrRegister('0001\tOSLO\t0301\tOSLO\tP\n9170\tLONGYEARBYEN\t2100\tSVALBARD\tG\n')).toEqual({
			rows: [
				{ postnr: '0001', poststed: 'OSLO', kommunenr: '0301', kommune: 'OSLO', kategori: 'P' },
				{ postnr: '9170', poststed: 'LONGYEARBYEN', kommunenr: '2100', kommune: 'SVALBARD', kategori: 'G' },
			],
			skippedLines: 0,
		});
	});

	test('strips CRLF line endings, and blank lines are not counted', () => {
		expect(parsePostnrRegister('0001\tOSLO\t0301\tOSLO\tP\r\n\r\n  \n0010\tOSLO\t0301\tOSLO\tB\r\n')).toEqual({
			rows: [
				{ postnr: '0001', poststed: 'OSLO', kommunenr: '0301', kommune: 'OSLO', kategori: 'P' },
				{ postnr: '0010', poststed: 'OSLO', kommunenr: '0301', kommune: 'OSLO', kategori: 'B' },
			],
			skippedLines: 0,
		});
	});

	test('leaves out and counts lines that are not rows', () => {
		const lines = [
			'0001\tOSLO\t0301\tOSLO\tP',
			'001\tOSLO\t0301\tOSLO\tP',
			'0002\t\t0301\tOSLO\tP',
			'0003\tOSLO\t301\tOSLO\tP',
			'0004\tOSLO\t0301\t\tP',
			'0005\tOSLO\t0301\tOSLO',
			'<!doctype html>',
		];

		expect(parsePostnrRegister(lines.join('\n'))).toEqual({
			rows: [{ postnr: '0001', poststed: 'OSLO', kommunenr: '0301', kommune: 'OSLO', kategori: 'P' }],
			skippedLines: 6,
		});
	});

	test('keeps a row with a kategori it does not know, or with more columns', () => {
		expect(parsePostnrRegister('0001\tOSLO\t0301\tOSLO\tX\textra').rows).toEqual([
			{ postnr: '0001', poststed: 'OSLO', kommunenr: '0301', kommune: 'OSLO', kategori: 'X' },
		]);
	});
});

describe('fetchPostnrRegister', () => {
	test('gives the rows Bring has now, with its windows-1252 letters', async () => {
		http.get(bringRegisterUrl, bringRegister());

		expect(await fetchPostnrRegister()).toEqual({
			rows: [
				{ postnr: '0184', poststed: 'OSLO', kommunenr: '0301', kommune: 'OSLO', kategori: 'G' },
				{ postnr: '1311', poststed: 'HØVIKODDEN', kommunenr: '3201', kommune: 'BÆRUM', kategori: 'G' },
			],
			skippedLines: 0,
		});
	});

	test('tries twice more when Bring fails', async () => {
		http.get(bringRegisterUrl, [failure(503), failure(503), bringRegister()]);

		expect((await fetchPostnrRegister()).rows).toHaveLength(2);
		expect(http.calls).toHaveLength(3);
	});

	test('rejects when Bring keeps failing', async () => {
		http.get(bringRegisterUrl, failure(500));

		await expect(fetchPostnrRegister()).rejects.toSatisfy(isHttpError);
		expect(http.calls).toHaveLength(3);
	});
});
