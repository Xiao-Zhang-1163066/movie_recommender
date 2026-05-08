import { prisma } from "../config/db.js";

export const getSessions = async (req, res) => {
  const { movieId, cinemaId, date } = req.query;
  const sessionQuery = {
    movieId: movieId ? movieId : undefined,
    cinemaId: cinemaId ? cinemaId : undefined,
    startsAt: date
      ? {
          gte: Date(date),
          lt: Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
        }
      : undefined,
  };
  const sessions = await prisma.session.findMany({
    where: sessionQuery,
    include: { movie: true, cinema: true },
  });
  res.status(200).json({
    status: "success",
    data: {
      sessions,
    },
    message: "Session retrieved successfully",
  });
};
