// Coordinates, millimetres, and degrees are weather readings, not kobo or micro-USDC.
/* eslint-disable local/no-float-money */
import { z } from "zod";
import { rainThresholdPct } from "./gate.js";

const hourly = z.object({
  time: z.array(z.string()),
  precipitation_probability: z.array(z.number()),
  precipitation: z.array(z.number()),
  temperature_2m: z.array(z.number()),
  wind_speed_10m: z.array(z.number()),
});

const openMeteo = z.object({ hourly });

export type ForecastHour = {
  time: string;
  precip_prob_pct: number;
  precip_mm: number;
  temp_c: number;
  wind_kmh: number;
};

export type WeatherForecast = {
  location: { lat: number; lng: number };
  generated_at: string;
  hours: ForecastHour[];
  summary: { max_precip_prob_pct_next_24h: number; rain_expected: boolean };
};

export function openMeteoUrl(lat: number, lng: number, hours: number): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("hourly", "precipitation_probability,precipitation,temperature_2m,wind_speed_10m");
  url.searchParams.set("forecast_hours", String(hours));
  url.searchParams.set("timezone", "Africa/Lagos");
  url.searchParams.set("wind_speed_unit", "kmh");
  return url.toString();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function forecastFromOpenMeteo(
  body: unknown,
  location: { lat: number; lng: number },
  generatedAt = new Date().toISOString(),
  threshold = rainThresholdPct(),
): WeatherForecast | null {
  const parsed = openMeteo.safeParse(body);
  if (!parsed.success) return null;
  const rows = parsed.data.hourly;
  const count = Math.min(
    rows.time.length,
    rows.precipitation_probability.length,
    rows.precipitation.length,
    rows.temperature_2m.length,
    rows.wind_speed_10m.length,
  );
  if (count === 0) return null;
  const hours: ForecastHour[] = [];
  for (let index = 0; index < count; index += 1) {
    const time = rows.time[index];
    const prob = rows.precipitation_probability[index];
    const precip = rows.precipitation[index];
    const temp = rows.temperature_2m[index];
    const wind = rows.wind_speed_10m[index];
    if (time === undefined || prob === undefined || precip === undefined || temp === undefined || wind === undefined) continue;
    if (![prob, precip, temp, wind].every((item) => Number.isFinite(item))) continue;
    hours.push({
      time,
      precip_prob_pct: Math.round(prob),
      precip_mm: round1(precip),
      temp_c: round1(temp),
      wind_kmh: round1(wind),
    });
  }
  if (hours.length === 0) return null;
  const next = hours.slice(0, 24);
  const max = next.reduce((highest, hour) => Math.max(highest, hour.precip_prob_pct), 0);
  return {
    location,
    generated_at: generatedAt,
    hours,
    summary: { max_precip_prob_pct_next_24h: max, rain_expected: max >= threshold },
  };
}

export function precipMmNext24h(forecast: WeatherForecast): number {
  const total = forecast.hours.slice(0, 24).reduce((sum, hour) => sum + hour.precip_mm, 0);
  return round1(total);
}

export function mmLabel(mm: number): string {
  if (!Number.isFinite(mm) || mm < 0) return "0";
  const tenths = Math.round(mm * 10);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? String(whole) : `${whole}.${frac}`;
}

const forecastBody = z.object({
  location: z.object({ lat: z.number(), lng: z.number() }),
  generated_at: z.string(),
  hours: z.array(
    z.object({
      time: z.string(),
      precip_prob_pct: z.number(),
      precip_mm: z.number(),
      temp_c: z.number(),
      wind_kmh: z.number(),
    }),
  ),
  summary: z.object({
    max_precip_prob_pct_next_24h: z.number(),
    rain_expected: z.boolean(),
  }),
});

export function parseForecast(body: unknown): WeatherForecast | null {
  const parsed = forecastBody.safeParse(body);
  if (!parsed.success || parsed.data.hours.length === 0) return null;
  return parsed.data;
}

export function weatherQuery(url: URL): { lat: number; lng: number; hours: number } | null {
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const hoursRaw = url.searchParams.get("hours");
  const hours = hoursRaw === null || hoursRaw === "" ? 48 : Number(hoursRaw);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) return null;
  return { lat, lng, hours };
}
