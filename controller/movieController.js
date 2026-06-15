import { prisma } from "../config/db.js";
import { cache } from "../config/redis.js";

const CACHE_KEYS = {
  all: "movies:all",
  inTheaters: "movies:inTheaters",
};

// GET /movies -public
const getAllMovies = async (req, res) => {
  const { inTheaters } = req.query;
  const cacheKey = inTheaters === "true" ? CACHE_KEYS.inTheaters : CACHE_KEYS.all;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const where =
    inTheaters === "true"
      ? { sessions: { some: { startsAt: { gte: new Date() } } } }
      : undefined;
  const movies = await prisma.movie.findMany({ where });
  const body = {
    status: "success",
    data: { movies, movieNumber: movies.length },
    message: "Movie list retrieved successfully",
  };

  await cache.set(cacheKey, body);
  res.status(200).json(body);
};

// GET /movies/:id -public
const getMovieById = async (req, res) => {
  const movieId = req.params.id;
  const movie = await prisma.movie.findUnique({ where: { id: movieId } });
  if (!movie) {
    return res.status(404).json({
      status: "fail",
      message: "Movie not found",
    });
  }
  res.status(200).json({
    status: "success",
    data: {
      movie,
    },
    message: "Movie retrieved successfully",
  });
};

// POST /movies — protected
const createMovie = async (req, res) => {
  const { title, overview, releaseYear, genres, runtime, posterUrl } = req.body;
  const newMovie = await prisma.movie.create({
    data: {
      title,
      overview,
      releaseYear,
      genres,
      runtime,
      posterUrl,
      createdBy: req.user.id,
    },
  });
  await cache.del(CACHE_KEYS.all, CACHE_KEYS.inTheaters);
  res.status(201).json({
    status: "success",
    data: {
      movie: newMovie,
    },
    message: "Movie created successfully",
  });
};

// PUT /movies/:id — protected
const updateMovie = async (req, res) => {
  const movieId = req.params.id;
  const movie = await prisma.movie.findUnique({ where: { id: movieId } });
  if (!movie) {
    return res.status(404).json({
      status: "fail",
      message: "Movie not found",
    });
  }
  if (movie.createdBy !== req.user.id) {
    return res.status(403).json({
      status: "fail",
      message: "You are not authorized to update this movie",
    });
  }
  const { title, overview, releaseYear, genres, runtime, posterUrl } = req.body;
  const updatedMovie = await prisma.movie.update({
    where: { id: movieId },
    data: {
      title,
      overview,
      releaseYear,
      genres,
      runtime,
      posterUrl,
    },
  });
  await cache.del(CACHE_KEYS.all, CACHE_KEYS.inTheaters);
  res.status(200).json({
    status: "success",
    data: {
      movie: updatedMovie,
    },
    message: "Movie updated successfully",
  });
};

// DELETE /movies/:id — protected
const deleteMovie = async (req, res) => {
  const movieId = req.params.id;
  const movie = await prisma.movie.findUnique({ where: { id: movieId } });
  if (!movie) {
    return res.status(404).json({
      status: "fail",
      message: "Movie not found",
    });
  }
  if (movie.createdBy !== req.user.id) {
    return res.status(403).json({
      status: "fail",
      message: "You are not authorized to delete this movie",
    });
  }
  await prisma.movie.delete({ where: { id: movieId } });
  await cache.del(CACHE_KEYS.all, CACHE_KEYS.inTheaters);
  res.status(200).json({
    status: "success",
    message: "Movie deleted successfully",
  });
};

export { getAllMovies, getMovieById, createMovie, updateMovie, deleteMovie };
