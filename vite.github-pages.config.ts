import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "github-pages",
  base: "/jobSeeking/",
  plugins: [react()],
  build: {
    outDir: "../dist-gh-pages",
    emptyOutDir: true,
  },
});
