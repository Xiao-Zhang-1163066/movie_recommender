import { streamText, tool, stepCountIs } from "ai";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { createGroq } from "@ai-sdk/groq";

// Step 1: create the Gemini provider using GEMINI_API_KEY from process.env
// const google = createGoogleGenerativeAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * POST /chat
 * Body: { messages: [{ role, content }] }
 */
export const chat = async (req, res, next) => {
  try {
    const { messages } = req.body;
    const userId = req.user.id;

    const tools = {
      get_user_watchlist: tool({
        description:
          "Get the logged-in user's watchlist, optionally filtered by status (PLANNED, WATCHING, COMPLETED, DROPPED)",
        parameters: z.object({
          status: z
            .enum(["PLANNED", "WATCHING", "COMPLETED", "DROPPED"])
            .optional(),
        }),
        execute: async ({ status }) => {
          const watchlist = await prisma.watchlistItem.findMany({
            where: { userId, ...(status ? { status } : {}) },
            include: { movie: true },
          });
          return watchlist;
        },
      }),
      get_taste_profile: tool({
        description:
          "Get a summary of the user's movie taste based on their watched and rated movies",
        parameters: z.object({}),
        execute: async () => {
          const watchedMovies = await prisma.watchlistItem.findMany({
            where: { userId, status: "COMPLETED", rating: { not: null } },
            include: { movie: true },
          });
          return {
            ratingCount: watchedMovies.length,
            avgRating: watchedMovies.length
              ? watchedMovies.reduce((acc, item) => acc + item.rating, 0) /
                watchedMovies.length
              : null,
            recentRatings: watchedMovies.slice(-5).map((item) => ({
              title: item.movie.title,
              rating: item.rating,
            })),
          };
        },
      }),
      mark_watched: tool({
        description:
          "Mark a movie as watched for the logged-in user, optionally with a rating (1-10) and notes",
        parameters: z.object({
          movieId: z.string(),
          rating: z.number().min(1).max(10).optional(),
          notes: z.string().optional(),
        }),
        execute: async ({ movieId, rating, notes }) => {
          // upsert a WatchlistItem: where userId+movieId, update status=COMPLETED+rating+notes, create if not exists
          await prisma.watchlistItem.upsert({
            where: { userId_movieId: { userId, movieId } }, // The WatchlistItem schema has @@unique([userId, movieId]), which Prisma exposes as a compound key called userId_movieId. The where for upsert must use it
            update: { status: "COMPLETED", rating, notes },
            create: { userId, movieId, status: "COMPLETED", rating, notes },
          });
          return { success: true };
        },
      }),

      search_movies: tool({
        description: "Search for movies by title using TMDB",
        parameters: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => {
          // fetch from https://api.themoviedb.org/3/search/movie
          const data = await fetch(
            `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`,
          ).then((res) => res.json());
          // return only: id, title, release_date, overview from results.results
          return data.results.map((movie) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            overview: movie.overview,
          }));
        },
      }),

      get_movie_details: tool({
        description:
          "Get full details for a specific movie by its TMDB movie ID",
        parameters: z.object({
          movieId: z.string(),
        }),
        execute: async ({ movieId }) => {
          // fetch from https://api.themoviedb.org/3/movie/{movieId}
          // query params: api_key
          const data = await fetch(
            `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}`,
          ).then((res) => res.json());
          // return only: id, title, release_date, overview, runtime, genres
          return {
            id: data.id,
            title: data.title,
            release_date: data.release_date,
            overview: data.overview,
            runtime: data.runtime,
            genres: data.genres.map((g) => g.name),
          };
        },
      }),
      get_showtimes: tool({
        description:
          "Get cinema showtimes for a specific movie, optionally filtered by date (YYYY-MM-DD format)",
        parameters: z.object({
          movieId: z.string(),
          date: z.string().optional(),
        }),
        execute: async ({ movieId, date }) => {
          // build a where clause: always filter by movieId

          // if date is provided, filter startsAt >= start of that day and < start of next day
          const where = { movieId };
          if (date) {
            const startDate = new Date(date);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            where.startsAt = { gte: startDate, lt: endDate };
          }
          const sessions = await prisma.session.findMany({
            where,
            include: { cinema: true },
          });
          return sessions;
        },
      }),
    };

    const result = streamText({
      model: groq("llama-3.3-70b-versatile"),
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });
    result.pipeTextStreamToResponse(res);
  } catch (err) {
    next(err);
  }
};
