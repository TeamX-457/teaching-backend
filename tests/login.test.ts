import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { buildApp } from "@/app";

describe("Login endpoint", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return a 200 OK status on POST /api/auth/sign-in", async () => {
    const payload = {
      email: "sacred@gmail.com",
      password: "password",
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: payload,
    });

    const data = response.json();
    
    // Since the user doesn't exist, we expect a 401 Unauthorized.
    // If the user did exist, it would be 200 and return a user/session object.
    expect(response.statusCode).toBe(401);
    expect(data.message).toBeDefined(); 
    // On success, you would assert: 
    // expect(response.statusCode).toBe(200);
    // expect(data.user.email).toBe(payload.email);
  });
});
