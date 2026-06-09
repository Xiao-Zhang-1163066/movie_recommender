import { prisma } from "../config/db.js";

// GET /watchlist - protected
const getWatchlist = async (req, res) => {
  const watchlist = await prisma.watchlistItem.findMany({
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

// POST /watchlist - protected
const addToWatchlist = async (req, res) => {
  const {
    tmdbId,
    title,
    posterUrl,
    overview,
    releaseYear,
    voteAverage,
    status,
    rating,
    notes,
  } = req.body;
  let movie = await prisma.movie.findUnique({
    where: {
      tmdbId,
    },
  });
  if (!movie) {
    movie = await prisma.movie.create({
      data: {
        tmdbId,
        title,
        posterUrl,
        overview,
        releaseYear,
        voteAverage,
        createdBy: req.user.id,
      },
    });
  } else if (movie.voteAverage == null && voteAverage != null) {
    movie = await prisma.movie.update({
      where: { id: movie.id },
      data: { voteAverage },
    });
  }
  try {
    const watchlistItem = await prisma.watchlistItem.create({
      data: {
        userId: req.user.id,
        movieId: movie.id,
        status,
        rating,
        notes,
      },
    });
    res.status(201).json({
      status: "success",
      data: {
        watchlistItem,
      },
      message: "Movie added to watchlist successfully",
    });
  } catch (error) {
    //4. if creation fails because of duplicate (userId+movieId), return 400
    if (error.code === "P2002") {
      return res.status(400).json({
        status: "fail",
        message: "Movie already in watchlist",
      });
    }
    return res
      .status(500)
      .json({ status: "fail", message: "Something went wrong" });
  }
};

// PUT /watchlist/:id - protected
const updateWatchlistEntry = async (req, res) => {
  const watchlistId = req.params.id;
  const { status, rating, notes } = req.body;
  const watchlistEntry = await prisma.watchlistItem.findUnique({
    where: { id: watchlistId },
  });
  if (!watchlistEntry) {
    return res.status(404).json({
      status: "fail",
      message: "Watchlist entry not found",
    });
  }
  if (watchlistEntry.userId !== req.user.id) {
    return res.status(403).json({
      status: "fail",
      message: "Not authorized to update this watchlist entry",
    });
  }
  const updatedEntry = await prisma.watchlistItem.update({
    where: { id: watchlistId },
    data: { status, rating, notes },
  });
  res.status(200).json({
    status: "success",
    data: {
      watchlist: updatedEntry,
    },
    message: "Watchlist entry updated successfully",
  });
};

// DELETE /watchlist/:id - protected
const removeFromWatchlist = async (req, res) => {
  const watchlistId = req.params.id;
  const watchlistEntry = await prisma.watchlistItem.findUnique({
    where: { id: watchlistId },
  });
  if (!watchlistEntry) {
    return res.status(404).json({
      status: "fail",
      message: "Watchlist entry not found",
    });
  }
  if (watchlistEntry.userId !== req.user.id) {
    return res.status(403).json({
      status: "fail",
      message: "Not authorized to delete this watchlist entry",
    });
  }
  await prisma.watchlistItem.delete({ where: { id: watchlistId } });
  res.status(204).send();
};

export {
  getWatchlist,
  addToWatchlist,
  updateWatchlistEntry,
  removeFromWatchlist,
};
