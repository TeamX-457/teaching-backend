import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;

// Neon (the team's original database) uses its HTTP driver. Any other
// Postgres, e.g. Supabase, uses a normal connection. prepare:false keeps it
// compatible with Supabase's transaction pooler (port 6543).
const isNeon = /neon\.tech/.test(url ?? "");

export const db = isNeon
  ? drizzleNeon(url)
  : (drizzlePg({ client: postgres(url, { prepare: false, max: 5 }) }) as unknown as ReturnType<
      typeof drizzleNeon
    >);
