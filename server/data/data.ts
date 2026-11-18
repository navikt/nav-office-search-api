import { logger } from '@navikt/navno-logger';
import { env } from '../env.ts';
import { recordDataLoadFailure, recordDataLoadSuccess } from '../metrics.ts';
import { buildBydeler } from './bydeler.ts';
import { readFiles } from './files.ts';
import { buildKommuner } from './kommuner.ts';
import { fetchNorgOffices } from './norg.ts';
import { fetchOfficePaths, joinOffices, type Offices } from './offices.ts';
import { buildPoststeder } from './poststeder.ts';
import type { Bydel, Kommune, Poststed } from './types.ts';
import { bydelerWithoutOffice, kommunerWithoutOffice, poststederWithoutOffice } from './withoutOffice.ts';

// The reference data the searches read: all of it from one load, and never changed after
export type ReferenceData = {
	// Each kommune's and bydel's office, by kommunenr or bydelsnr
	offices: Offices;
	// The bydeler with an office
	bydeler: Bydel[];
	// The kommuner with bydeler, or with an office
	kommuner: Kommune[];
	// Every poststed, by postnummer
	poststeder: Map<string, Poststed>;
};

// This guards against data coming back empty or significantly changed from 'today'
// Each is set to roughly half of the November 2026 data levels
const floors = { offices: 200, bydeler: 15, poststeder: 2500, kommuner: 150 };

let inUse: ReferenceData | undefined;

// Whether a load has succeeded, so there is data to search in
export const hasReferenceData = () => inUse !== undefined;

// The data in use. Throws before the first load.
export const referenceData = () => {
	if (!inUse) {
		throw new Error('The reference data is not loaded');
	}
	return inUse;
};

// Says which source failed
const from = async <Data>(source: string, loading: Promise<Data>) => {
	try {
		return await loading;
	} catch (e) {
		throw new Error(`Failed to load ${source}`, { cause: e });
	}
};

// Loads the reference data and puts it in use: all of it, or none. When a source fails, or the new data is too small
// to be right, this throws and the data in use stays as it is.
export const loadData = async () => {
	logger.info('Started loading data');
	const startedAt = performance.now();

	try {
		const [officePaths, norgOffices, files] = await Promise.all([
			from('office URLs from XP', fetchOfficePaths()),
			from('offices from NORG', fetchNorgOffices()),
			from('the files the build downloaded', readFiles(env.DATA_FILES_DIR)),
		]);
		const register = files.postnrRegister.rows;
		const ssbBydeler = files.bydeler.bydeler;

		// Each builds on the ones before it
		const offices = joinOffices(norgOffices, officePaths);
		const bydeler = buildBydeler(ssbBydeler, offices);
		const kommuner = buildKommuner(register, bydeler, offices);
		const poststeder = buildPoststeder(register, kommuner);

		const sizes: Record<string, number> = {
			office_urls: officePaths.size,
			offices: offices.size,
			bydeler: bydeler.length,
			postnr_register: register.length,
			kommuner: kommuner.length,
			poststeder: poststeder.size,
		};
		for (const [dataset, floor] of Object.entries(floors)) {
			const size = sizes[dataset];
			if (size < floor) {
				throw Object.assign(new Error(`Too little reference data: ${dataset}`), { dataset, size, floor });
			}
		}

		inUse = { offices, bydeler, kommuner, poststeder };

		const withoutOffice: Record<string, string[]> = {
			kommuner: kommunerWithoutOffice(register, kommuner),
			poststeder: poststederWithoutOffice(poststeder.values(), kommuner),
			bydeler: bydelerWithoutOffice(ssbBydeler, offices),
		};
		for (const [dataset, numbers] of Object.entries(withoutOffice)) {
			// One message for all of them, with the numbers as fields, so the log groups them
			if (numbers.length > 0) {
				logger.warn('No office found', { dataset, count: numbers.length, numbers: numbers.slice(0, 20) });
			}
		}

		const durationSeconds = (performance.now() - startedAt) / 1000;
		recordDataLoadSuccess(
			durationSeconds,
			sizes,
			Object.fromEntries(Object.entries(withoutOffice).map(([dataset, numbers]) => [dataset, numbers.length]))
		);
		logger.info('Finished loading data', {
			durationSeconds: Number(durationSeconds.toFixed(1)),
			...sizes,
			filesFetchedAt: files.postnrRegister.fetchedAt,
		});
	} catch (e) {
		// Logged by whoever started the load
		recordDataLoadFailure();
		throw e;
	}
};

const RETRY_AFTER_MS = 60_000;

let retry: NodeJS.Timeout | undefined;

// Loads the data, at start and every morning, and logs a load that fails. With data in use, that stays until the next
// morning. With none, as after a first load that fails, the load is tried again every minute until one succeeds.
// Never rejects.
export const refreshData = async () => {
	try {
		await loadData();
		clearTimeout(retry);
		retry = undefined;
	} catch (e) {
		logger.error('Loading data failed', e);

		// One retry at a time, also when the morning's load fails beside it
		if (!inUse && !retry) {
			retry = setTimeout(() => {
				retry = undefined;
				void refreshData();
			}, RETRY_AFTER_MS).unref();
		}
	}
};
