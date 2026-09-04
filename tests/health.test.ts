import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { buildApp } from "../src/app";

describe("Health Endpoint", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    // Disable logger in test environment for cleaner output
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return a 200 OK status on GET /api/health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
  });
});
