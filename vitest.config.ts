import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/calendar.ts", "src/lib/leaveApprovals.ts", "src/lib/wbs.ts", "src/lib/projects.ts"],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        functions: 100,
        lines: 85,
        statements: 85,
        branches: 100,
      },
    },
  },
});
