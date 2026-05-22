import { prisma } from "../config/db.js";
// let movies = [
//   { id: 1, title: "The Shawshank Redemption", year: 1994 },
//   { id: 2, title: "The Godfather", year: 1972 },
//   { id: 3, title: "The Dark Knight", year: 2008 },
// ];
// let users = [
//   { id: 1, name: "John Doe", email: "johndoe@gmail.com" },
//   { id: 2, name: "Jane Doe", email: "janedoe@gmail.com" },
// ];

// GET /movies -public
const getAllMovies = async (req, res) => {
  const { inTheaters } = req.query;
  const where =
    inTheaters === "true"
      ? { sessions: { some: { startsAt: { gte: new Date() } } } }
      : undefined;
  const movies = await prisma.movie.findMany({ where });
  res.status(200).json({
    status: "success",
    data: {
      movies: movies,
      movieNumber: movies.length,
    },
    message: "Movie list retrieved successfully",
  });
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
  res.status(200).json({
    status: "success",
    message: "Movie deleted successfully",
  });
};

export { getAllMovies, getMovieById, createMovie, updateMovie, deleteMovie };
