import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      AUTH_SECRET: "test-secret-test-secret-test-secret-123456",
      ANTHROPIC_API_KEY: "",
    },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
