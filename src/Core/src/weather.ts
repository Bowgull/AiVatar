// Weather from Open-Meteo (free, no key, no account), shared by the PC and the Mac: the Mac's morning brief needs it
// when Shadow is off (his pick, 2026-10-13), and the Mac is sent only small files.
const TZ = 'America/Toronto';
export const LAT = 43.65, LON = -79.38; // Toronto, from Joshua's profile

const WMO: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'heavy freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light rain showers', 81: 'rain showers', 82: 'heavy rain showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};
export const describeWeatherCode = (c: number): string => WMO[c] ?? `weather code ${c}`;

/**
 * Today's weather for the morning brief (6.15): now, the high and low, and the chance of rain. Same free
 * service as get_weather (Open-Meteo, no key, no account), and like the rest of the brief, no model.
 */
export async function fetchDayWeather(fetchImpl: typeof fetch = fetch): Promise<{ now: number; high: number; low: number; words: string; rain: number }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
    `&forecast_days=1&timezone=${encodeURIComponent(TZ)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`weather service returned ${res.status}`);
  const j: any = await res.json();
  return {
    now: Math.round(j.current.temperature_2m), high: Math.round(j.daily.temperature_2m_max[0]), low: Math.round(j.daily.temperature_2m_min[0]),
    words: describeWeatherCode(j.daily.weather_code[0]), rain: Math.round(j.daily.precipitation_probability_max[0] ?? 0),
  };
}

