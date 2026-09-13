const errorHandler = (err, req, res, next) => {
  // 1. get status code from err.statusCode, default to 500
  const statusCode = err.statusCode || 500;
  // 2. send JSON response with status "error" and err.message
  //
  // res.status() is not optional here. Without it express falls back to the
  // default 200, so a failed request returns a success code carrying an error
  // body — the kind of failure a client never notices until data goes missing.
  res.status(statusCode).json({
    status: "error",
    message: err.message || "Internal Server Error",
  });
};
export { errorHandler };
