import { logger } from '@navikt/navno-logger';
import { env } from '../env.ts';
import { readFiles } from './files.ts';

// Says in the log what the two downloaded files hold and when the build fetched them. No endpoint reads them yet, so
// when one is missing or broken that is logged and nothing else happens. Never rejects.
export const reportFiles = async () => {
	try {
		const { postnrRegister, bydeler } = await readFiles(env.DATA_FILES_DIR);

		logger.info('Read the downloaded files', {
			postnr: postnrRegister.rows.length,
			postnrSkippedLines: postnrRegister.skippedLines,
			postnrFetchedAt: postnrRegister.fetchedAt,
			bydeler: bydeler.bydeler.length,
			bydelerValidFrom: bydeler.validFrom,
			bydelerFetchedAt: bydeler.fetchedAt,
		});
	} catch (e) {
		logger.error('Failed to read the downloaded files', e);
	}
};
