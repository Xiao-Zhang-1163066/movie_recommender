import { prisma } from "../config/db.js";

// GET /cinemas -public
const getAllCinemas = async (req, res) => {
  const cinemas = await prisma.cinema.findMany();
  res.status(200).json({
    status: "success",
    data: {
      cinemas: cinemas,
      count: cinemas.length,
    },
    message: "Cinema retrieved successfully",
  });
};

// GET /cinemas/:slug -public
const getCinemaBySlug = async (req, res) => {
  const cinemaSlug = req.params.slug;
  const cinema = await prisma.cinema.findUnique({
    where: { slug: cinemaSlug },
    include: {
      // Upcoming only: the scraper never deletes past sessions, so without this
      // the page lists every film this cinema has ever shown.
      sessions: {
        where: { startsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
        include: {
          movie: true,
        },
      },
    },
  });
  if (!cinema) {
    return res.status(404).json({
      status: "fail",
      message: "Cinema not found",
    });
  }
  res.status(200).json({
    status: "success",
    data: {
      cinema,
    },
    message: "Cinema retrieved successfully",
  });
};
export { getAllCinemas, getCinemaBySlug };
