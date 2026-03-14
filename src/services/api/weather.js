const BASE = 'https://api.open-meteo.com/v1';

const WMO_DESC = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'heavy freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm',
};

// Map WMO code to a pseudo OpenWeather-style ID so alert logic in store still works:
// codes < 45 (clear/clouds) → 800+, codes 45-48 (fog) → 701, codes 51+ (precip/storms) → 200-699
function wmoToId(code) {
  if (code >= 95) return 200; // thunderstorm
  if (code >= 80) return 500; // rain showers
  if (code >= 71) return 600; // snow
  if (code >= 51) return 300; // drizzle / rain
  if (code >= 45) return 701; // fog (above 700 → no alert)
  return 800;                 // clear / partly cloudy / overcast
}

async function fetchOpenMeteo(params) {
  const url = new URL(`${BASE}/forecast`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  return res.json();
}

export async function getCurrentWeather(lat, lng) {
  const data = await fetchOpenMeteo({
    latitude: lat,
    longitude: lng,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    timezone: 'auto',
  });
  const c = data.current;
  return {
    main: {
      temp: c.temperature_2m,
      feels_like: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
    },
    weather: [{ id: wmoToId(c.weather_code), description: WMO_DESC[c.weather_code] ?? 'unknown' }],
    wind: { speed: c.wind_speed_10m },
  };
}

export async function getHourlyForecast(lat, lng) {
  const data = await fetchOpenMeteo({
    latitude: lat,
    longitude: lng,
    hourly: 'temperature_2m,apparent_temperature,weather_code',
    forecast_days: 2,
    timezone: 'auto',
  });
  const { time, temperature_2m, apparent_temperature, weather_code } = data.hourly;
  return time.slice(0, 16).map((t, i) => ({
    dt: new Date(t).getTime() / 1000,
    main: { temp: temperature_2m[i], feels_like: apparent_temperature[i] },
    weather: [{ id: wmoToId(weather_code[i]), description: WMO_DESC[weather_code[i]] ?? 'unknown' }],
  }));
}
