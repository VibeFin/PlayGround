import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5421, strictPort: true, open: false },
  // allowedHosts: start.sh serves dist/ through `vite preview` behind a public
  // tunnel whose hostname changes per session, so the preview must accept it.
  preview: { port: 5420, strictPort: true, open: false, allowedHosts: true },
  build: {
    target: "es2022",
    sourcemap: false,
    rolldownOptions: {
      output: {
        // three ships as core + WebGL module + addons; separate vendor chunks load in parallel and cache.
        codeSplitting: {
          groups: [
            { name: "three-core", test: /node_modules[\\/].*three[\\/]build[\\/]three\.core/, priority: 2 },
            { name: "three", test: /node_modules[\\/].*three[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
