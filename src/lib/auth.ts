import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../config/db/db";
import { betterAuth } from "better-auth";
import * as schema from "../models/schema";
import { allowedOrigins } from "../config/origins";
import { sendPasswordReset, sendVerification } from "./mailer";

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
    // The emailed link works once and lasts an hour; the pages that use it are /forgot-password and /reset-password.
    resetPasswordTokenExpiresIn: 60 * 60,
    // Never awaited by better-auth's callers in a way that can fail the request: sendEmail never throws.
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordReset(user.email, user.name, url);
    },
  },
  emailVerification: {
    // The welcome email: asks them to confirm their address. Not required to sign in.
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerification(user.email, user.name, url);
    },
  },
});
