const errorHandler = (err, req, res, next) => {
  // 1. get status code from err.statusCode, default to 500
  const statusCode = err.statusCode || 500;
  // 2. send JSON response with status "error" and err.message
  res.json({
    status: "error",
    message: err.message || "Internal Server Error",
  });
};
export { errorHandler };
