import { env } from '../env.ts';
import { fetchJson, type OkResponse } from '../fetch.ts';
import { recordNorgRefreshFailure, recordNorgRefreshSuccess } from '../metrics.ts';

const norgEnhetApi = `${env.NORG2_ORIGIN}/norg2/api/v1/enhet`;
const norgNavkontorerApi = `${norgEnhetApi}/navkontorer`;

// Map is intentional here to avoid old school object-hijinks like 'constructor' and '__proto__'
type GeoIdToEnhetMap = Map<string, NorgEnhetSimple>;

type NorgEnhet = {
	aktiveringsdato: string;
	antallRessurser: number;
	enhetId: number;
	enhetNr: string;
	kanalstrategi: string;
	navn: string;
	nedleggelsesdato: string;
	oppgavebehandler: boolean;
	orgNivaa: string;
	orgNrTilKommunaltNavKontor: string;
	organisasjonsnummer: string;
	sosialeTjenester: string;
	status: string;
	type: string;
	underAvviklingDato: string;
	underEtableringDato: string;
	versjon: number;
};

type NorgEnhetSimple = Pick<NorgEnhet, 'enhetNr' | 'navn'>;

type NorgEnhetResponse = NorgEnhet[] & OkResponse;

type NorgNavkontorerResponse = {
	navKontorId: number;
	geografiskOmraade: string;
	enhetId: number;
	alternativEnhetId: number;
}[] &
	OkResponse;

const simplifyNorgEnhet = (norgEnhet: NorgEnhet): NorgEnhetSimple => ({
	enhetNr: norgEnhet.enhetNr,
	navn: norgEnhet.navn,
});

let geoIdToEnhetMap: GeoIdToEnhetMap = new Map();

export const getOfficeData = (geoId: string) => geoIdToEnhetMap.get(geoId);

// Load office info from norg and refresh the office info map
export const loadNorgOfficeInfo = async () => {
	try {
		console.log('Loading office data from norg...');

		const enhetResponse = await fetchJson<NorgEnhetResponse>(norgEnhetApi, {
			enhetStatusListe: 'AKTIV',
		});

		if (enhetResponse.error) {
			console.error(`Fetch error from norg enhet: ${enhetResponse.message}`);
			recordNorgRefreshFailure();
			return false;
		}

		const newEnhetMap: GeoIdToEnhetMap = new Map();
		let failedOffices = 0;

		const lokalEnheter = enhetResponse.filter((item) => item.type === 'LOKAL');

		for (const enhet of lokalEnheter) {
			const kontorerResponse = await fetchJson<NorgNavkontorerResponse>(`${norgNavkontorerApi}/${enhet.enhetNr}`);

			if (kontorerResponse.error) {
				failedOffices++;
				// Reuse the previous data if fetching new data failed
				geoIdToEnhetMap.forEach((prevEnhet, geoId) => {
					if (prevEnhet.enhetNr === enhet.enhetNr) {
						newEnhetMap.set(geoId, prevEnhet);
					}
				});

				console.error(`Fetch error from norg navkontorer: ${kontorerResponse.message}`);
			} else {
				const enhetSimple = simplifyNorgEnhet(enhet);

				kontorerResponse.forEach((item) => {
					newEnhetMap.set(item.geografiskOmraade, enhetSimple);
				});
			}
		}

		geoIdToEnhetMap = newEnhetMap;

		const geoIdsLoaded = geoIdToEnhetMap.size;
		recordNorgRefreshSuccess(geoIdsLoaded, failedOffices);

		console.log(`Finished loading office data! Offices for ${geoIdsLoaded} geoids loaded.`);
		return true;
	} catch (error) {
		console.error('Error loading office data:', error);
		recordNorgRefreshFailure();
		return false;
	}
};
