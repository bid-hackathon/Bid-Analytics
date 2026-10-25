import { createFixtureServices } from "./fixtureServices";
import { createHttpServices } from "./httpServices";
import type { ExplorerServices } from "./types";

export type { ExplorerServices } from "./types";

/**
 * NEXT_PUBLIC_DATA_MODE=live uses workstream C's /api/v1 routes.
 * Anything else uses the isolated development fixtures and simulators.
 */
export function createServices(mode = process.env.NEXT_PUBLIC_DATA_MODE, baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ""): ExplorerServices {
  return mode === "live" ? createHttpServices(baseUrl) : createFixtureServices();
}
