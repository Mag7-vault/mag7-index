import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";

// Local contract wiring is never copied into the public production bundle.
const localDeployment = new URL("./deployment.local.json", import.meta.url);
const developmentDeployment = {
  name: "development-deployment",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (
        req.url?.split("?")[0] !== "/deployment.json" ||
        !existsSync(localDeployment)
      )
        return next();
      try {
        const body = readFileSync(localDeployment, "utf8");
        JSON.parse(body);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
      } catch {
        res.statusCode = 500;
        res.end("Invalid local deployment configuration");
      }
    });
  },
};

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  plugins: [react(), developmentDeployment],
});
