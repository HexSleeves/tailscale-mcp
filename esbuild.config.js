import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read package.json to get dependencies
let packageJson = {
  dependencies: {},
  peerDependencies: {},
  optionalDependencies: {},
};

try {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
} catch (error) {
  console.warn(
    "Warning: Could not read package.json dependencies:",
    error.message,
  );
}

const baseConfig = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
  external: [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ],
  resolveExtensions: [".ts", ".js"],
  jsx: "preserve",
  // Define environment
  // NODE_ENV defined in specific configs
};

// ESM config (main executable)
const esmConfig = {
  ...baseConfig,
  format: "esm",
  outfile: "dist/index.js",
  // Banner to add shebang for executable
  banner: {
    js: "#!/usr/bin/env node\n// Tailscale MCP Server - Built with esbuild",
  },
};

// CommonJS config (for require() compatibility)
const cjsConfig = {
  ...baseConfig,
  format: "cjs",
  outfile: "dist/index.cjs",
};

// Development configs
export const devEsmConfig = {
  ...esmConfig,
  minify: false,
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": '"development"',
  },
};

export const devCjsConfig = {
  ...cjsConfig,
  minify: false,
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": '"development"',
  },
};

// Production configs
export const prodEsmConfig = {
  ...esmConfig,
  minify: true,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

export const prodCjsConfig = {
  ...cjsConfig,
  minify: true,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

// Watch config (only ESM for development)
export const watchConfig = {
  ...devEsmConfig,
  watch: {
    onRebuild(error, result) {
      if (error) {
        console.error("❌ Build failed:", error);
      } else {
        console.log("✅ Build succeeded");
      }
    },
  },
};

// Build function
export async function buildProject(configs = [prodEsmConfig, prodCjsConfig]) {
  try {
    // Ensure configs is an array
    const configArray = Array.isArray(configs) ? configs : [configs];

    // Build all configurations
    const results = await Promise.all(
      configArray.map((config) => build(config)),
    );

    console.log("✅ Build completed successfully");

    // Make the ESM output executable (only the main entry point)
    const { chmodSync } = await import("node:fs");
    try {
      chmodSync("dist/index.js", 0o755);
      console.log("✅ Made output executable");
    } catch (error) {
      console.warn("⚠️ Could not make output executable:", error.message);
    }

    return results;
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || "build";

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: bun esbuild.config.js [mode]");
    console.log("Modes: dev, watch, build (default)");
    process.exit(0);
  }

  switch (mode) {
    case "dev":
      await buildProject([devEsmConfig, devCjsConfig]);
      break;
    case "watch":
      await buildProject(watchConfig);
      break;
    case "build":
    default:
      await buildProject([prodEsmConfig, prodCjsConfig]);
      break;
  }
}
