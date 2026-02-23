import NodeCache from 'node-cache';
import schedule from 'node-schedule';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface Office {
  id: string;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
const CACHE_KEY = 'offices_data';

// Proxy configuration for NAV network
const proxyAgent = process.env.HTTPS_PROXY
  ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
  : undefined;

async function fetchOfficesFromSource(): Promise<Office[]> {
  // TODO: Replace with actual data source
  // This is a placeholder implementation
  console.log('Fetching offices from data source...');

  // Example: Fetch from external API
  // const response = await fetch('https://api.nav.no/offices', {
  //   agent: proxyAgent,
  // });
  // return await response.json();

  return [
    { id: '1', name: 'NAV Oslo', city: 'Oslo', postalCode: '0001' },
    { id: '2', name: 'NAV Bergen', city: 'Bergen', postalCode: '5003' },
    { id: '3', name: 'NAV Trondheim', city: 'Trondheim', postalCode: '7011' },
  ];
}

export async function getOffices(): Promise<Office[]> {
  const cachedData = cache.get<Office[]>(CACHE_KEY);

  if (cachedData) {
    console.log('Returning cached office data');
    return cachedData;
  }

  const offices = await fetchOfficesFromSource();
  cache.set(CACHE_KEY, offices);

  return offices;
}

export async function searchOffices(query: string): Promise<Office[]> {
  const offices = await getOffices();
  const lowerQuery = query.toLowerCase();

  return offices.filter(office =>
    office.name.toLowerCase().includes(lowerQuery) ||
    office.city?.toLowerCase().includes(lowerQuery) ||
    office.postalCode?.includes(query)
  );
}

// Schedule cache refresh every hour
schedule.scheduleJob('0 * * * *', async () => {
  console.log('Scheduled cache refresh starting...');
  try {
    const offices = await fetchOfficesFromSource();
    cache.set(CACHE_KEY, offices);
    console.log('Cache refreshed successfully');
  } catch (error) {
    console.error('Failed to refresh cache:', error);
  }
});

