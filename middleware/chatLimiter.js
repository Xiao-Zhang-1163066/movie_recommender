import rateLimit from "express-rate-limit";

// Create a chatLimiter using rateLimit
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 10, // limit each user to 10 requests per window
  keyGenerator: (req) => req.user.id, // use user ID as the key for rate limiting
  message: { error: "Too many chat requests, please try again later." }, // error message to send when rate limit is exceeded
  standardHeaders: true, // send RateLimit-* headers to the client
  legacyHeaders: false, // disable the older X-RateLimit-* headers
});

export default chatLimiter;
