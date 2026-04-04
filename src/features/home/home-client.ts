export type LegacyApiResponse<T> = {
  code: number;
  msg: string;
  data: T;
};

export type AuthPayload = {
  user_id: number;
  token: string;
  create_time: number;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  signal?: AbortSignal;
};

function buildErrorMessage(payload: Partial<LegacyApiResponse<unknown>> | null, status: number): string {
  if (payload && typeof payload.msg === "string" && payload.msg.trim()) {
    return payload.msg.trim();
  }

  if (status >= 500) {
    return "服务暂时不可用，请稍后再试。";
  }

  return "请求失败，请稍后再试。";
}

export async function requestLegacy<T>(
  url: string,
  options: RequestOptions = {}
): Promise<LegacyApiResponse<T>> {
  const { method = "GET", data, signal } = options;
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {}
  };

  if (data !== undefined) {
    init.body = JSON.stringify(data);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await fetch(url, init);
  let payload: LegacyApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as LegacyApiResponse<T>;
  } catch {
    throw new Error(response.ok ? "响应格式错误，请稍后再试。" : "服务响应异常，请稍后再试。");
  }

  if (!response.ok || Number(payload.code) !== 1) {
    throw new Error(buildErrorMessage(payload, response.status));
  }

  return payload;
}

export function persistAuthCookies(auth: AuthPayload): void {
  const ttlSeconds = 60 * 60 * 24 * 15;
  document.cookie = `user_id=${encodeURIComponent(String(auth.user_id))}; Path=/; Max-Age=${ttlSeconds}; SameSite=Lax`;
  document.cookie = `token=${encodeURIComponent(auth.token)}; Path=/; Max-Age=${ttlSeconds}; SameSite=Lax`;
}

export function clearAuthCookies(): void {
  document.cookie = "user_id=; Path=/; Max-Age=0; SameSite=Lax";
  document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
}
