import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/main/db/schema.ts",
  out: "./src/main/db/drizzle",
  dialect: "sqlite",
});
