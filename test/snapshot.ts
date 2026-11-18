import { readFileSync } from 'node:fs';
import type { MockFetch } from '@itsy/corgi/testing';
import { norgEnhetUrl, xpOfficeInfoUrl } from './fixtures.ts';

const fixture = (path: string): unknown =>
	JSON.parse(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));

// The snapshot in test/fixtures, which its README describes: NORG's units, the areas of its local offices by
// enhetNr, and XP's office pages. The two data files in test/fixtures/files are from the same snapshot.
export const norgEnheter = fixture('norg/enhet.json') as {
	enhetNr: string;
	navn: string;
	type: string;
	status: string;
}[];
export const norgNavkontorer = fixture('norg/navkontorer.json') as Record<string, { geografiskOmraade: string }[]>;
export const xpOffices = fixture('xp/office-info.json') as { offices: { enhetNr: string; path: string }[] };

export const isNavkontorerRequest = ({ url }: { url: string }) => url.startsWith(`${norgEnhetUrl}/navkontorer/`);
export const enhetNrOf = ({ pathname }: { pathname: string }) => pathname.split('/').at(-1) ?? '';

// Answers NORG and XP from the snapshot. A route registered after this wins over it.
export const answerSnapshot = (http: MockFetch) => {
	http.get(norgEnhetUrl, { json: norgEnheter });
	http.get(isNavkontorerRequest, (call) => {
		const areas = norgNavkontorer[enhetNrOf(call)];
		return areas ? { json: areas } : { status: 404, json: { message: 'Not found' } };
	});
	http.get(xpOfficeInfoUrl, { json: xpOffices });
};
