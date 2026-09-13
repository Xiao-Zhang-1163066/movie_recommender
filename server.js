import { config } from "dotenv";
import { connectDB, disconnectDB } from "./config/db.js";
import app from "./app.js";

config();
connectDB();

const port = process.env.PORT || 3000;

// Keep the http.Server handle — the shutdown handlers below need it to stop
// accepting connections before the process exits.
const server = app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

// Handle unhandled promise rejections (e.g., database connection errors)
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
  server.close(async () => {
    await disconnectDB();
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", async (error) => {
  console.error("Uncaught Exception:", error);
  await disconnectDB();
  process.exit(1);
});

// Gracefully handle shutdown signals (e.g., SIGINT, SIGTERM)
process.on("SIGINT", async () => {
  console.log("Received SIGINT. Shutting down gracefully...");
  await disconnectDB();
  process.exit(0);
});
