import { logger } from '@navikt/navno-logger';
import { download } from './download.ts';

// `pnpm build`: downloads the two files the image carries. A failure ends the build, so no image is made without them.
try {
	const { postnrRegister, bydeler } = await download();

	logger.info('Downloaded the data files', {
		postnr: postnrRegister.rows.length,
		postnrSkippedLines: postnrRegister.skippedLines,
		bydeler: bydeler.bydeler.length,
		bydelerValidFrom: bydeler.validFrom,
	});
} catch (e) {
	// Logged and exited here, since Node would print a thrown error as plain text
	logger.error('Failed to download the data files', e);
	process.exit(1);
}
