import { buildApp } from "./src/app";

const app = buildApp();

app
  .listen({ port: 3000, host: "0.0.0.0" })
  .then(() => {
    console.log("Server running on http://localhost:3000");
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
