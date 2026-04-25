// Test bootstrap. Bun test preloads this via bunfig.toml.
// Pin time-related env so tests are deterministic.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";
