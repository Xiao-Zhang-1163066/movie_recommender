import express from "express";
import { config } from "dotenv";
import { connectDB, disconnectDB } from "./config/db.js";
import cookieParser from "cookie-parser";
import cors from "cors";
// Import routes
import movieRoutes from "./routes/movieRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import cinemaRoutes from "./routes/cinemaRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";

config();
connectDB();

const app = express();
// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse cookies
app.use(cookieParser());

// CORS middleware (for development, adjust as needed for production)
app.use(
  cors({
    origin: "http://localhost:5173", // Adjust this to your frontend URL
    credentials: true, // Allow cookies to be sent with requests
  }),
);

// api routes
app.use("/auth", authRoutes);
app.use("/movies", movieRoutes);
app.use("/watchlist", watchlistRoutes);
app.use("/cinemas", cinemaRoutes);
app.use("/sessions", sessionRoutes);

const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!???");
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

// Handle unhandled promise rejections (e.g., database connection errors)
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
  server.close(async (error) => {
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
