import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../config/db/db";
import { betterAuth } from "better-auth";
import * as schema from "../models/schema";

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
  // Trust any origin for now; restrict once the frontend URL is known.
  trustedOrigins: async (request) => [request?.headers.get("origin")],
  emailAndPassword: {
    enabled: true,
  },
});
