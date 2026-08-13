/* eslint-disable @typescript-eslint/no-explicit-any */
import dayjs from "dayjs";
import { formatNumber } from "./helper";
import type {
  MonitorsDataResult,
  SiteDaysStatus,
  SiteStatusType,
} from "~~/types/main";

const STATUS_MAP: Record<string, SiteStatusType["status"]> = {
  PAUSED: 0,
  NOT_STARTED: 1,
  UP: 2,
  DOWN: 9,
  SEEMS_DOWN: 8,
};

const TYPE_MAP: Record<string, SiteStatusType["type"]> = {
  HTTP: 1,
  KEYWORD: 2,
  PING: 3,
  PORT: 4,
  HEARTBEAT: 5,
  DNS: 6,
  API: 7,
};

const decodeHtmlEntities = (value: unknown) => {
  if (typeof value !== "string" || !value.includes("&")) return String(value ?? "");

  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return value
    .replace(/&#(\d+);|&#x([0-9a-f]+);|&([a-z]+);/gi, (entity, decimal, hexadecimal, name) => {
      if (decimal) return String.fromCodePoint(Number(decimal));
      if (hexadecimal) return String.fromCodePoint(parseInt(hexadecimal, 16));
      return namedEntities[name.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();
};

const getMonitorId = (site: any) => String(site?.id ?? site?.monitorId ?? site?.monitor_id ?? "");

const getIncidentMonitorId = (incident: any) =>
  String(
    incident?.monitor?.id ??
      incident?.monitorId ??
      incident?.monitor_id ??
      incident?.monitorID ??
      "",
  );

const getIncidentStart = (incident: any) => {
  const startedAt = incident?.startedAt ?? incident?.started_at ?? incident?.startTime;
  if (typeof startedAt === "number") return dayjs.unix(startedAt);
  return dayjs(startedAt);
};

const getIncidentEnd = (incident: any, startedAt: dayjs.Dayjs) => {
  if (typeof incident?.duration === "number") {
    return startedAt.add(Math.max(incident.duration, 0), "second");
  }

  const resolvedAt = dayjs(incident?.resolvedAt ?? incident?.resolved_at);
  return resolvedAt.isValid() ? resolvedAt : dayjs();
};

const getOverlapDuration = (
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  rangeStart: dayjs.Dayjs,
  rangeEnd: dayjs.Dayjs,
) => {
  const overlapStart = start.isAfter(rangeStart) ? start : rangeStart;
  const overlapEnd = end.isBefore(rangeEnd) ? end : rangeEnd;
  return Math.max(overlapEnd.diff(overlapStart, "second"), 0);
};

/**
 * Format site data.
 * @param data The site data to format.
 * @returns The formatted site data.
 */
export const formatSiteData = (
  data: any,
  dates: dayjs.Dayjs[],
): MonitorsDataResult | undefined => {
  if (!data?.monitors) return undefined;
  const { public: configPublic } = useRuntimeConfig();
  const { showLink } = configPublic;
  const sites: any[] = data.monitors;
  if (!Array.isArray(data.incidents)) {
    throw new Error("Missing UptimeRobot incidents data");
  }
  const incidents: any[] = data.incidents;

  const formatData = sites?.map((site: any): SiteStatusType => {
    const dailyData: SiteDaysStatus[] = [];
    const timeMap = new Map<string, number>();
    const ranges = Array.isArray(site.custom_uptime_ranges)
      ? [...site.custom_uptime_ranges]
      : typeof site.custom_uptime_ranges === "string"
        ? site.custom_uptime_ranges.split("-")
        : [];
    const hasLegacyRanges = ranges.length > 0;
    const legacyPercent = hasLegacyRanges ? formatNumber(Number(ranges.pop() || 0)) : undefined;

    dates.forEach((date, index) => {
      const dayStart = date.startOf("day");
      const dayEnd = date.isSame(dayjs(), "day") ? dayjs() : dayStart.endOf("day");
      const daySeconds = Math.max(dayEnd.diff(dayStart, "second"), 1);

      timeMap.set(date.format("YYYYMMDD"), index);
      dailyData[index] = {
        date: date.unix(),
        percent: hasLegacyRanges ? formatNumber(Number(ranges[index] || 0)) : 100,
        down: { times: 0, duration: 0 },
      };

      if (!hasLegacyRanges) {
        dailyData[index].down.duration = 0;
        dailyData[index].down.times = 0;
        dailyData[index].percent = 100;
        (dailyData[index] as SiteDaysStatus & { _daySeconds?: number })._daySeconds = daySeconds;
      }
    });

    const total = { times: 0, duration: 0 };
    const monitorId = getMonitorId(site);
    const rangeStart = dates[dates.length - 1]?.startOf("day");
    const rangeEnd = dates[0]?.isSame(dayjs(), "day")
      ? dayjs()
      : dates[0]?.endOf("day");

    incidents.forEach((incident: any) => {
      if (getIncidentMonitorId(incident) !== monitorId) return;

      const startedAt = getIncidentStart(incident);
      if (!startedAt.isValid() || !rangeStart || !rangeEnd) return;

      const endedAt = getIncidentEnd(incident, startedAt);
      const clippedDuration = getOverlapDuration(startedAt, endedAt, rangeStart, rangeEnd);
      if (clippedDuration <= 0) return;

      const startDateIndex = timeMap.get(startedAt.format("YYYYMMDD"));
      if (startDateIndex !== undefined && dailyData[startDateIndex]) {
        dailyData[startDateIndex].down.times += 1;
      }

      dailyData.forEach((day) => {
        const dayStart = dayjs.unix(day.date || 0).startOf("day");
        const dayEnd = dayStart.isSame(dayjs(), "day") ? dayjs() : dayStart.endOf("day");
        day.down.duration += getOverlapDuration(startedAt, endedAt, dayStart, dayEnd);
      });

      total.times += 1;
      total.duration += clippedDuration;
    });

    dailyData.forEach((day) => {
      const dayStart = dayjs.unix(day.date || 0).startOf("day");
      const dayEnd = dayStart.isSame(dayjs(), "day") ? dayjs() : dayStart.endOf("day");
      const daySeconds = Math.max(dayEnd.diff(dayStart, "second"), 1);
      const uptime = Math.max(daySeconds - day.down.duration, 0);
      day.percent = formatNumber((uptime / daySeconds) * 100);
    });

    const totalSeconds = Math.max(
      (rangeEnd?.diff(rangeStart, "second") ?? 0) || 1,
      1,
    );
    const totalPercent = formatNumber(
      Math.max(((totalSeconds - total.duration) / totalSeconds) * 100, 0),
    );

    return {
      id: Number(site.id ?? 0),
      name: decodeHtmlEntities(site?.friendlyName || site?.friendly_name || "未命名站点"),
      url: showLink ? site?.url : undefined,
      status: STATUS_MAP[String(site?.status ?? "").toUpperCase()] ?? 8,
      type: TYPE_MAP[String(site?.type ?? "").toUpperCase()] ?? 1,
      interval: Number(site?.interval ?? 0),
      percent: legacyPercent ?? totalPercent,
      days: dailyData?.reverse(),
      down: total,
    };
  });

  return {
    status: formatData.reduce(
      (acc, site) => {
        if (site.status === 2) acc.ok++;
        else if (site.status === 8 || site.status === 9) acc.error++;
        else if (site.status === 0 || site.status === 1) acc.unknown++;
        return acc;
      },
      { count: formatData.length, ok: 0, error: 0, unknown: 0 },
    ),
    data: formatData,
    timestamp: Date.now(),
  };
};
