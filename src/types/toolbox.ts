export interface ToolboxHttpKeyValue {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface ToolboxHttpGroup {
  id: number;
  name: string;
  defaultGroup: boolean;
  requestCount?: number;
  createTime?: string;
  updateTime?: string;
}

export interface ToolboxHttpRequestSummary {
  id: number;
  groupId: number;
  name: string;
  method: string;
  url: string;
  lastStatusCode?: number | null;
  lastDurationMs?: number | null;
  lastRunAt?: string;
  lastErrorMessage?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ToolboxHttpGroupTree {
  id: number;
  name: string;
  defaultGroup: boolean;
  requestCount?: number;
  createTime?: string;
  updateTime?: string;
  requests: ToolboxHttpRequestSummary[];
}

export interface ToolboxHttpRequestDetail {
  id: number;
  groupId: number;
  name: string;
  method: string;
  url: string;
  queryParams: ToolboxHttpKeyValue[];
  headers: ToolboxHttpKeyValue[];
  authType: string;
  authConfig: Record<string, any>;
  bodyMode: string;
  bodyText?: string;
  bodyForm: ToolboxHttpKeyValue[];
  timeoutMs: number;
  followRedirects: boolean;
  lastStatusCode?: number | null;
  lastDurationMs?: number | null;
  lastRunAt?: string;
  lastErrorMessage?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ToolboxHttpRequestSaveRequest {
  groupId?: number;
  name: string;
  method: string;
  url: string;
  queryParams: ToolboxHttpKeyValue[];
  headers: ToolboxHttpKeyValue[];
  authType: string;
  authConfig: Record<string, any>;
  bodyMode: string;
  bodyText?: string;
  bodyForm: ToolboxHttpKeyValue[];
  timeoutMs: number;
  followRedirects: boolean;
}

export interface ToolboxHttpExecuteRequest {
  method: string;
  url: string;
  queryParams: ToolboxHttpKeyValue[];
  headers: ToolboxHttpKeyValue[];
  authType: string;
  authConfig: Record<string, any>;
  bodyMode: string;
  bodyText?: string;
  bodyForm: ToolboxHttpKeyValue[];
  timeoutMs: number;
  followRedirects: boolean;
}

export interface ToolboxHttpExecuteResponse {
  success: boolean;
  statusCode?: number | null;
  durationMs?: number | null;
  responseSize?: number | null;
  contentType?: string;
  resolvedUrl?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  responseBody?: string;
  curlCommand?: string;
  errorMessage?: string | null;
  executedAt?: string;
}

export interface ToolboxHttpHistory {
  id: number;
  requestId: number;
  requestSnapshotJson?: string;
  responseStatusCode?: number | null;
  responseHeadersJson?: string;
  responseBody?: string;
  responseSize?: number | null;
  durationMs?: number | null;
  success: boolean;
  errorMessage?: string | null;
  createTime?: string;
}
