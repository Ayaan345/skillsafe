import { z } from "zod";

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optString = (min = 1) => z.preprocess(blankToUndefined, z.string().min(min).optional());
const optUrl = () => z.preprocess(blankToUndefined, z.url().optional());

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optUrl(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optString(20),
});

export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optString(20),
  REPORT_SIGNING_SECRET: optString(32),
  SAFE_BROWSING_API_KEY: optString(),
  L8_CLASSIFIER_API_KEY: optString(),
  L8_CLASSIFIER_MODEL: optString(),
  L8_CLASSIFIER_BASE_URL: optUrl(),
});

export const FORBIDDEN_PUBLIC_SECRET = /^NEXT_PUBLIC_.*(SERVICE_ROLE|SECRET|PRIVATE|TOKEN|API_KEY)/;
