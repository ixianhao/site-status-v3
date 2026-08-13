// https://uptimerobot.com/api/#methods
import dayjs from "dayjs";
import { verifyJwt } from "../utils/jwt";
import type { MonitorsDataResult, MonitorsResult } from "~~/types/main";
import { getCache, setCache } from "~/utils/cache-server";
import { formatSiteData } from "~/utils/format";

type UptimeRobotPage<T> =
  | T[]
  | {
      data?: T[];
      monitors?: T[];
      incidents?: T[];
      nextLink?: string | null;
      nextCursor?: string | number | null;
      pagination?: {
        nextCursor?: string | number | null;
        cursor?: string | number | null;
      };
    };

type UptimeRobotIncident = {
  startedAt?: string;
};

const getRanges = (): { dates: dayjs.Dayjs[]; start: string; end: string } | undefined => {
  try {
    const dates = [];
    const config = useRuntimeConfig();
    const days = config.public.countDays;
    const today = dayjs(new Date().setHours(0, 0, 0, 0));
    for (let d = 0; d < days; d++) dates.push(today.subtract(d, "day"));
    // UptimeRobot v3 incidents filter requires ISO 8601 date strings without milliseconds.
    // See: https://uptimerobot.com/api/v3/#get-/incidents
    const toIsoSeconds = (value: dayjs.Dayjs) => value.toDate().toISOString().replace(/\.\d{3}Z$/, "Z");
    const start = toIsoSeconds(dates[dates.length - 1].startOf("day"));
    const end = toIsoSeconds(dates[0].endOf("day"));
    return { dates, start, end };
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

const normalizeApiUrl = (apiUrl: string) => {
  let normalized = apiUrl.trim().replace(/\/+$/, "");

  if (/\/v2$/i.test(normalized)) normalized = normalized.replace(/\/v2$/i, "/v3");
  else if (!/\/v3$/i.test(normalized)) normalized = `${normalized}/v3`;

  return `${normalized}/`;
};

const getNextCursor = <T>(response: UptimeRobotPage<T>) => {
  if (Array.isArray(response)) return undefined;

  const cursor = response?.nextCursor ?? response?.pagination?.nextCursor ?? response?.pagination?.cursor;
  if (cursor) return cursor.toString().trim() || undefined;

  if (response?.nextLink) {
    try {
      return new URL(response.nextLink).searchParams.get("cursor")?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const getPageData = <T>(response: UptimeRobotPage<T>) => {
  if (Array.isArray(response)) return response;
  return response?.data ?? response?.monitors ?? response?.incidents ?? [];
};

const getAuthorizationHeader = (apiKey: string) => {
  const value = apiKey.trim();
  return value.match(/^(Bearer|Basic)\s+/i) ? value : `Bearer ${value}`;
};

const logUptimeRobotError = (path: string, error: unknown) => {
  const status = error && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined;
  const responseBody =
    error && typeof error === "object" && "data" in error
      ? error.data
      : error && typeof error === "object" && "response" in error && error.response
        ? (error.response as { _data?: unknown })._data
        : undefined;

  console.error("UptimeRobot request failed", {
    path,
    status,
    responseBody,
  });
};

const isTooManyRequestsError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const statusCode = "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : undefined;
  const responseStatus =
    "response" in error && error.response && typeof error.response === "object" && "status" in error.response
      ? Number((error.response as { status?: unknown }).status)
      : undefined;
  return statusCode === 429 || responseStatus === 429;
};

const fetchUptimeRobot = async <T>(
  apiUrl: string,
  apiKey: string,
  path: string,
  query?: Record<string, string | number | undefined>,
) => {
  try {
    return await $fetch<T>(`${apiUrl}${path}`, {
      method: "GET",
      query,
      headers: {
        Accept: "application/json",
        Authorization: getAuthorizationHeader(apiKey),
      },
    });
  } catch (error) {
    logUptimeRobotError(path, error);
    throw error;
  }
};

const fetchAllPages = async <T>(
  apiUrl: string,
  apiKey: string,
  path: string,
  query: Record<string, string | number | undefined> = {},
  options: { limit?: number } = {},
) => {
  const data: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 100; page++) {
    const response = await fetchUptimeRobot<UptimeRobotPage<T>>(apiUrl, apiKey, path, {
      ...options,
      ...query,
      cursor,
    });

    data.push(...getPageData(response));
    cursor = getNextCursor(response);
    if (!cursor) break;
  }

  return data;
};

const fetchIncidentsInRange = async (
  apiUrl: string,
  apiKey: string,
  startTime: number,
  endTime: number,
) => {
  const incidents: UptimeRobotIncident[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 5; page++) {
    const response = await fetchUptimeRobot<UptimeRobotPage<UptimeRobotIncident>>(
      apiUrl,
      apiKey,
      "incidents",
      cursor ? { cursor } : undefined,
    );
    const pageData = getPageData(response);
    let hasOlderIncident = false;

    pageData.forEach((incident) => {
      if (!incident.startedAt) return;
      const startedAt = new Date(incident.startedAt).getTime();
      if (!Number.isFinite(startedAt)) return;
      if (startedAt < startTime) {
        hasOlderIncident = true;
        return;
      }
      if (startedAt <= endTime) incidents.push(incident);
    });

    cursor = getNextCursor(response);
    if (!cursor || hasOlderIncident) break;
  }

  return incidents;
};

/**
 * 获取站点数据
 */
export default defineEventHandler(async (event): Promise<MonitorsResult> => {
  try {
    const config = useRuntimeConfig();
    const { apiUrl, apiKey, sitePassword, siteSecretKey } = config;
    if (!apiUrl || !apiKey) {
      throw new Error("Missing API url or API key");
    }
    if (sitePassword && siteSecretKey) {
      const token = getCookie(event, "authToken");
      if (!token) throw new Error("Please log in first");
      const isLogin = await verifyJwt(token);
      if (!isLogin) throw new Error("Invalid or expired token");
    }
    const cacheKey = "site-data";
    const cachedData = getCache(cacheKey);
    if (cachedData) {
      return {
        code: 200,
        message: "success",
        source: "cache",
        data: cachedData as MonitorsDataResult,
      };
    }
    const rangesData = getRanges();
    if (!rangesData) throw new Error("Missing");
    const { dates, start, end } = rangesData;
    const baseApiUrl = normalizeApiUrl(apiUrl);
    const monitors = await fetchAllPages(baseApiUrl, apiKey, "monitors", {}, { limit: 50 });
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const incidents = await fetchIncidentsInRange(baseApiUrl, apiKey, startTime, endTime);
    const data = formatSiteData({ monitors, incidents }, dates);
    setCache(cacheKey, data, 1000 * 60);
    return {
      code: 200,
      message: "success",
      source: "api",
      data,
    };
  } catch (error) {
    if (isTooManyRequestsError(error)) {
      const backupData = getCache<MonitorsDataResult>("site-data-backup");
      if (backupData) {
        return {
          code: 200,
          message: "success",
          source: "cache",
          data: backupData,
        };
      }
    }

    setResponseStatus(event, 500);
    return {
      code: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      source: "api",
      data: undefined,
    };
  }
});
