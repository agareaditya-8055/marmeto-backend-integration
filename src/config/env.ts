
import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env
dotenv.config();

// Define the environment schema
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_DATABASE: z.string().min(1),

  SHOPIFY_WEBHOOK_SECRET: z.string().min(1),

  REDIS_URL: z
  .string()
  .url()
  .refine((value) => value.startsWith("rediss://"), {
    message: "REDIS_URL must use a secure rediss:// connection",
  }),
  ADMIN_API_KEY: z.string().min(32),
});

// Validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration:");
  console.error(z.treeifyError(parsedEnv.error));

  process.exit(1);
}

// Export typed configuration
export const env = parsedEnv.data;
