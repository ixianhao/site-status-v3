export type SiteType = "loading" | "warn" | "error" | "unknown" | "normal";

export interface SiteDaysStatus {
  date?: number;
  percent: number;
  down: {
    times: number;
    duration: number;
  };
}

export interface SiteStatusType extends SiteDaysStatus {
  id: number;
  name: string;
  status: 0 | 1 | 2 | 8 | 9;
  type: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  interval: number;
  days: SiteDaysStatus[];
  url?: string;
}

export interface MonitorsDataResult {
  status: {
    count: number;
    ok: number;
    error: number;
    unknown: number;
  };
  data: SiteStatusType[];
  timestamp: number;
}

export interface MonitorsResult {
  code: number;
  message: string;
  source: "cache" | "api";
  data: MonitorsDataResult | undefined;
}

export type SiteLangType = "zh-CN" | "ja-JP" | "ko-KR" | "en";
