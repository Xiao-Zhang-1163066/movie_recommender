import { prisma } from "../config/db.js";
import { nzDayRange } from "../utils/nzDay.js";

export const getSessions = async (req, res) => {
  let { movieId, tmdbId, cinemaId, date } = req.query;
  if (tmdbId) {
    const movie = await prisma.movie.findUnique({
      where: { tmdbId: parseInt(tmdbId) },
    });
    if (!movie) {
      return res.status(200).json({
        status: "success",
        data: {
          sessions: [],
        },
      });
    }
    movieId = movie.id;
  }
  const day = date ? nzDayRange(date) : null;
  const sessionQuery = {
    movieId: movieId ? movieId : undefined,
    cinemaId: cinemaId ? cinemaId : undefined,
    // An explicit date is honoured even if past; the default is upcoming only,
    // because the scraper never deletes past sessions.
    startsAt: day ? { gte: day.start, lt: day.end } : { gt: new Date() },
  };
  const sessions = await prisma.session.findMany({
    where: sessionQuery,
    include: { movie: true, cinema: true },
    orderBy: { startsAt: "asc" },
  });
  res.status(200).json({
    status: "success",
    data: {
      sessions,
    },
    message: "Session retrieved successfully",
  });
};
