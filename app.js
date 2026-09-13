import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
// Import routes
import movieRoutes from "./routes/movieRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import cinemaRoutes from "./routes/cinemaRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import { errorHandler } from "./middleware/errorMiddleware.js";

// The express app is built here and exported without being started, so tests
// can mount it with supertest. Starting the server and connecting to the
// database stay in server.js — importing this module must have no side effects
// beyond building the app, or every test would open a real DB connection.
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse cookies
app.use(cookieParser());

// CORS middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true, // Allow cookies to be sent with requests
  }),
);

// api routes
app.use("/api/auth", authRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/cinemas", cinemaRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/chat", chatRoutes);

app.get("/", (req, res) => {
  res.send("Hello World!???");
});

// Must be registered last — Express only treats a 4-arg middleware as the error
// handler, and only errors from middleware registered *before* it reach it.
app.use(errorHandler);

export default app;
