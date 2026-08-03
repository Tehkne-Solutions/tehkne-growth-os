import { createHash } from "node:crypto";

export function buildLeadIdentityHash(input: Readonly<{
  email?: string | null;
  phone?: string | null;
}>): string | null {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const canonical = email ? `email:${email}` : phone ? `phone:${phone}` : null;
  return canonical ? createHash("sha256").update(canonical).digest("hex") : null;
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}
