import path from "node:path";

process.loadEnvFile(path.resolve(import.meta.dirname, "../.env"));
