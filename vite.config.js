import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Use relative asset URLs so the same build works from Vercel and
// Capacitor's local Android WebView origin (https://localhost).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
