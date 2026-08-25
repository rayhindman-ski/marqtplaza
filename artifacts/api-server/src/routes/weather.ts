import { Router, type IRouter } from "express";

type WeatherCondition =
  | "clear"
  | "partly_cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "thunderstorm"
  | "unknown";

type WeatherResponse = {
  cityId: string;
  locationName: string;
  fetchedAt: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    precipitation: number;
    windSpeed: number;
    weatherCode: number;
    condition: WeatherCondition;
    isDay: boolean;
  };
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    precipitationProbability: number;
    weatherCode: number;
    condition: WeatherCondition;
  }>;
  provider: "open-meteo";
};

const CITY_WEATHER: Record<string, { name: string; latitude: number; longitude: number }> = {
  dhg: { name: "Den Haag", latitude: 52.0705, longitude: 4.3007 },
  ams: { name: "Amsterdam", latitude: 52.3676, longitude: 4.9041 },
  rot: { name: "Rotterdam", latitude: 51.9244, longitude: 4.4777 },
  utr: { name: "Utrecht", latitude: 52.0907, longitude: 5.1214 },
  ein: { name: "Eindhoven", latitude: 51.4416, longitude: 5.4697 },
};

const weatherCache = new Map<string, { expiresAt: number; data: WeatherResponse }>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;

function weatherCondition(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code >= 45 && code <= 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "showers";
  if (code >= 95) return "thunderstorm";
  return "unknown";
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Weather response missing numeric ${field}`);
  }
  return value;
}

const router: IRouter = Router();

router.get("/weather", async (req, res) => {
  const cityId = String(req.query["cityId"] ?? "").trim().toLowerCase();
  const city = CITY_WEATHER[cityId];

  if (!city) {
    res.status(400).json({ message: "Unknown city for weather lookup." });
    return;
  }

  const cached = weatherCache.get(cityId);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(city.latitude));
  url.searchParams.set("longitude", String(city.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "Europe/Amsterdam");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "marqtplaza.com/1.0 (local discovery app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);

    const payload = await response.json() as {
      current?: Record<string, unknown>;
      daily?: Record<string, unknown>;
    };
    const current = payload.current ?? {};
    const daily = payload.daily ?? {};
    const dates = Array.isArray(daily.time) ? daily.time : [];
    const max = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
    const min = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
    const probabilities = Array.isArray(daily.precipitation_probability_max)
      ? daily.precipitation_probability_max
      : [];
    const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];

    const data: WeatherResponse = {
      cityId,
      locationName: city.name,
      fetchedAt: new Date().toISOString(),
      current: {
        temperature: finiteNumber(current.temperature_2m, "current temperature"),
        apparentTemperature: finiteNumber(current.apparent_temperature, "apparent temperature"),
        precipitation: finiteNumber(current.precipitation, "current precipitation"),
        windSpeed: finiteNumber(current.wind_speed_10m, "wind speed"),
        weatherCode: finiteNumber(current.weather_code, "current weather code"),
        condition: weatherCondition(finiteNumber(current.weather_code, "current weather code")),
        isDay: current.is_day === 1,
      },
      forecast: dates.slice(0, 3).map((date, index) => {
        const weatherCode = finiteNumber(codes[index], `forecast weather code ${index}`);
        return {
          date: String(date),
          high: finiteNumber(max[index], `forecast high ${index}`),
          low: finiteNumber(min[index], `forecast low ${index}`),
          precipitationProbability: finiteNumber(probabilities[index], `forecast rain probability ${index}`),
          weatherCode,
          condition: weatherCondition(weatherCode),
        };
      }),
      provider: "open-meteo",
    };

    weatherCache.set(cityId, { expiresAt: Date.now() + WEATHER_CACHE_TTL_MS, data });
    res.json(data);
  } catch (error) {
    console.warn("[weather] Open-Meteo unavailable:", error instanceof Error ? error.message : error);
    res.status(503).json({ message: "Weather is temporarily unavailable." });
  }
});

export default router;