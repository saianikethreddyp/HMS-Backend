import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
  SESSION_COOKIE_NAME: z.string().min(1).default("hms_sid"),
  CSRF_COOKIE_NAME: z.string().min(1).default("hms_csrf"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  // Used to auto-provision the first admin account and default membership
  // offer on server startup when the database has none yet -- see
  // bootstrap.ts. Defaulted so this works with zero configuration.
  SEED_ADMIN_LOGIN: z.string().min(1).default("admin"),
  SEED_ADMIN_NAME: z.string().min(1).default("Administrator"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";
