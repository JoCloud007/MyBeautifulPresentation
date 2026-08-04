import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf-8");
const composeFile = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf-8");

describe("Docker Compose & UI Polish — Docker Configuration", () => {
  describe("Dockerfile", () => {
    it("uses multi-stage build", () => {
      const stages = dockerfile.match(/FROM\s+\S+\s+AS\s+\S+/g) || [];
      expect(stages.length).toBeGreaterThanOrEqual(3);
    });

    it("uses Node.js 20 Alpine base image", () => {
      expect(dockerfile).toContain("node:20-alpine");
    });

    it("has deps stage for installing dependencies", () => {
      expect(dockerfile).toMatch(/FROM\s+base\s+AS\s+deps/i);
    });

    it("has builder stage for building the app", () => {
      expect(dockerfile).toMatch(/FROM\s+base\s+AS\s+builder/i);
    });

    it("has runner stage for production", () => {
      expect(dockerfile).toMatch(/FROM\s+base\s+AS\s+runner/i);
    });

    it("disables Next.js telemetry", () => {
      expect(dockerfile).toContain("NEXT_TELEMETRY_DISABLED=1");
    });

    it("creates non-root user for security", () => {
      expect(dockerfile).toContain("addgroup");
      expect(dockerfile).toContain("adduser");
      expect(dockerfile).toContain("USER nextjs");
    });

    it("exposes port 3000", () => {
      expect(dockerfile).toContain("EXPOSE 3000");
    });

    it("uses standalone output for optimized image", () => {
      expect(dockerfile).toContain(".next/standalone");
      expect(dockerfile).toContain(".next/static");
    });

    it("sets HOSTNAME to 0.0.0.0", () => {
      expect(dockerfile).toContain('HOSTNAME="0.0.0.0"');
    });
  });

  describe("docker-compose.yml", () => {
    it("defines app service", () => {
      expect(composeFile).toContain("services:");
      expect(composeFile).toContain("app:");
    });

    it("maps port 5182 for the app", () => {
      expect(composeFile).toContain('"5182:3000"');
    });

    it("does not define ollama service", () => {
      expect(composeFile).not.toContain("ollama:");
    });

    it("does not map port 11434", () => {
      expect(composeFile).not.toContain('"11434:11434"');
    });

    it("does not use depends_on", () => {
      expect(composeFile).not.toContain("depends_on:");
    });

    it("defines a custom bridge network", () => {
      expect(composeFile).toContain("networks:");
      expect(composeFile).toContain("mybp-network:");
      expect(composeFile).toContain("driver: bridge");
    });

    it("does not define ollama volumes", () => {
      expect(composeFile).not.toContain("ollama-data:");
      expect(composeFile).not.toContain("- ollama-data:/root/.ollama");
    });

    it("sets NODE_ENV to production", () => {
      expect(composeFile).toContain("NODE_ENV=production");
    });

    it("sets NEXT_PUBLIC_APP_URL to port 5182", () => {
      expect(composeFile).toContain("NEXT_PUBLIC_APP_URL=http://localhost:5182");
    });

    it("does not use ollama image", () => {
      expect(composeFile).not.toContain("ollama/ollama:latest");
    });

    it("includes proxy build args", () => {
      expect(composeFile).toContain("HTTP_PROXY:");
      expect(composeFile).toContain("HTTPS_PROXY:");
    });

    it("includes proxy environment variables with COMPOSE_ prefix", () => {
      expect(composeFile).toContain("HTTP_PROXY=${COMPOSE_HTTP_PROXY:-}");
      expect(composeFile).toContain("HTTPS_PROXY=${COMPOSE_HTTPS_PROXY:-}");
    });
  });
});
