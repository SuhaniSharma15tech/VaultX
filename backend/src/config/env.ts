import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional().default(""),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  SUPABASE_BUCKET: z.string().optional().default("Vaultx-blobs"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BLOB_STORAGE_DIR: z.string().default("./storage/blobs"),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(104857600), // 100 MB
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  BLOB_STORAGE_PATH: path.resolve(process.cwd(), parsed.data.BLOB_STORAGE_DIR),
};
