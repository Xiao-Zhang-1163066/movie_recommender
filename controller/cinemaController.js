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
      sessions: {
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
