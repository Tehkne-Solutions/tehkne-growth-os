export type ConnectorFailureKind = "rate_limit" | "transient" | "authorization" | "permanent";

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export type ConnectorRetryPolicy = Readonly<{
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}>;

export const defaultConnectorRetryPolicy: ConnectorRetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 2_000,
  maxDelayMs: 60_000,
};

export function classifyConnectorFailure(error: unknown): ConnectorFailureKind {
  if (!(error instanceof ProviderHttpError)) return "permanent";
  if (error.status === 401 || error.status === 403) return "authorization";
  if (error.status === 408 || error.status === 425 || error.status === 429) return error.status === 429 ? "rate_limit" : "transient";
  if (error.status >= 500 && error.status <= 599) return "transient";
  return "permanent";
}

export function retryDelayMs(
  attempt: number,
  error: unknown,
  policy: ConnectorRetryPolicy = defaultConnectorRetryPolicy,
): number | null {
  const kind = classifyConnectorFailure(error);
  if (kind === "authorization" || kind === "permanent") return null;
  if (attempt >= policy.maxAttempts) return null;
  if (error instanceof ProviderHttpError && error.retryAfterMs !== null) {
    return Math.min(Math.max(0, error.retryAfterMs), policy.maxDelayMs);
  }
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, policy.maxDelayMs);
}

export type PlannedSyncWindow = Readonly<{
  startDate: string;
  endDate: string;
}>;

export function planPaidMediaSyncWindow(input: Readonly<{
  watermark: Date | null;
  now?: Date;
  initialLookbackDays?: number;
  overlapDays?: number;
  maxWindowDays?: number;
}>): PlannedSyncWindow {
  const now = input.now ?? new Date();
  const initialLookbackDays = input.initialLookbackDays ?? 14;
  const overlapDays = input.overlapDays ?? 2;
  const maxWindowDays = input.maxWindowDays ?? 31;
  if (initialLookbackDays < 1 || overlapDays < 0 || maxWindowDays < 1) throw new Error("Invalid connector sync-window policy.");

  const end = startOfUtcDay(now);
  let start: Date;
  if (input.watermark) {
    start = startOfUtcDay(input.watermark);
    start.setUTCDate(start.getUTCDate() - overlapDays);
  } else {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (initialLookbackDays - 1));
  }
  const earliestAllowed = new Date(end);
  earliestAllowed.setUTCDate(earliestAllowed.getUTCDate() - (maxWindowDays - 1));
  if (start < earliestAllowed) start = earliestAllowed;
  if (start > end) start = new Date(end);
  return { startDate: formatUtcDate(start), endDate: formatUtcDate(end) };
}

export async function withConnectorRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: Readonly<{
    policy?: ConnectorRetryPolicy;
    sleep?: (delayMs: number) => Promise<void>;
  }> = {},
): Promise<T> {
  const policy = options.policy ?? defaultConnectorRetryPolicy;
  const sleep = options.sleep ?? ((delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let attempt = 1;
  for (;;) {
    try {
      return await operation(attempt);
    } catch (error) {
      const delay = retryDelayMs(attempt, error, policy);
      if (delay === null) throw error;
      await sleep(delay);
      attempt += 1;
    }
  }
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
