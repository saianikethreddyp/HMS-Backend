import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { ensureBootstrapData } from "./bootstrap.js";

const app = createApp();

ensureBootstrapData(prisma)
  .catch((err) => {
    console.error("Failed to ensure bootstrap data (default offer/admin):", err);
  })
  .finally(() => {
    app.listen(env.PORT, () => {
      console.log(`hms-backend listening on port ${env.PORT}`);
    });
  });
