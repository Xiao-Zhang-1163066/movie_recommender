import prisma from "../config/db.js";

// GET /watchlist - protected
const getWatchlist = async (req, res) => {
  const watchlist = await prisma.watchlist.findMany({
    where: { userId: req.user.id },
    include: {
      movie: true,
    },
  });
  res.status(200).json({
    status: "success",
    data: {
      watchlist,
    },
    message: "Watchlist retrieved successfully",
  });
};
