import { isValidIanaTimezone } from "@newfork/shared";
import { find, setCache } from "geo-tz";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bearerToken, type WorkspaceContextResolver } from "../auth/workspace-context";

const querySchema = z.object({ country: z.string().regex(/^[A-Za-z]{2}$/), postal: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9 -]+$/) });
const placesSchema = z.object({ places: z.array(z.object({ latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180) })).min(1).max(40) });
export type TimezoneSuggestion = { timezone: string | null; source: "postal_centroid"; status: "suggested" | "unavailable" | "ambiguous" };
// Bound geographic subregion cache; never preload the worldwide boundary file.
const cache = new Map<string, unknown>();
const originalSet = cache.set.bind(cache);
cache.set = (key, value) => { if (cache.size >= 64 && !cache.has(key)) cache.delete(cache.keys().next().value!); return originalSet(key, value); };
setCache({ store: cache });

export async function suggestLocationTimezone(country: string, postal: string, fetcher: typeof fetch = fetch): Promise<TimezoneSuggestion> {
  const input = querySchema.parse({ country, postal });
  const unavailable: TimezoneSuggestion = { timezone: null, status: "unavailable", source: "postal_centroid" };
  try {
    const response = await fetcher(`https://api.zippopotam.us/${input.country.toLowerCase()}/${encodeURIComponent(input.postal)}`, { signal: AbortSignal.timeout(3000), headers: { Accept: "application/json" } });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 100_000) return unavailable;
    const text = await response.text();
    if (text.length > 100_000) return unavailable;
    const parsed = placesSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return unavailable;
    const zones = new Set(parsed.data.places.flatMap((place) => find(place.latitude, place.longitude)).filter((zone) => !zone.startsWith("Etc/") && isValidIanaTimezone(zone)));
    return zones.size === 1 ? { timezone: [...zones][0]!, status: "suggested", source: "postal_centroid" }
      : { ...unavailable, status: zones.size > 1 ? "ambiguous" : "unavailable" };
  } catch { return unavailable; }
}

export function registerTimezoneSuggestionRoutes(app: FastifyInstance, resolver: WorkspaceContextResolver | null) {
  app.get("/v1/location-timezone-suggestion", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token || !resolver || !(await resolver.resolve(token))) return reply.status(401).send({ error: "A current session is required" });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Valid country and postal code required" });
    return suggestLocationTimezone(query.data.country, query.data.postal);
  });
}
