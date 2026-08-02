export class InvalidRequestOriginError extends Error {
  constructor() {
    super("The request origin is not allowed.");
    this.name = "InvalidRequestOriginError";
  }
}

export function assertSameOrigin(request: Request, appUrl: string): void {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(appUrl).origin) {
    throw new InvalidRequestOriginError();
  }
}

export function getSessionCookieName(environment: string): string {
  return environment === "production"
    ? "__Host-tehkne_growth_session"
    : "tehkne_growth_session";
}

export function getSessionCookieOptions(
  environment: string,
  expires: Date,
): Readonly<{
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: "/";
  expires: Date;
}> {
  return {
    httpOnly: true,
    secure: environment === "production",
    sameSite: "strict",
    path: "/",
    expires,
  };
}

export function getIpPrefix(request: Request): string | null {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (!forwarded) return null;

  if (forwarded.includes(".")) {
    const parts = forwarded.split(".");
    return parts.length === 4 ? `${parts.slice(0, 3).join(".")}.0/24` : null;
  }

  if (forwarded.includes(":")) {
    return `${forwarded.split(":").slice(0, 4).join(":")}::/64`;
  }

  return null;
}
