import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../config/db/db";
import { betterAuth } from "better-auth";
import * as schema from "../models/schema";
import { allowedOrigins } from "../config/origins";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "student",
        input: true,
      },
    },
  },
  // Only our own sites may make cookie-authenticated requests (see src/config/origins.ts).
  trustedOrigins: async () => allowedOrigins(),
  emailAndPassword: {
    enabled: true,
  },
});
