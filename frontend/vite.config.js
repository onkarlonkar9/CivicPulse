import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// https://vitejs.dev/config/
export default defineConfig(() => ({
    server: {
        host: "::",
        port: 8080,
        hmr: {
            overlay: false,
        },
        proxy: {
            "/api": {
                target: "http://localhost:4000",
                changeOrigin: true,
            },
            "/uploads": {
                target: "http://localhost:4000",
                changeOrigin: true,
            },
            "/ws": {
                target: "ws://localhost:4000",
                ws: true,
                changeOrigin: true,
            },
        },
    },
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
        dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
}));
