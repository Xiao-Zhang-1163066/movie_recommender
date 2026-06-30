import rateLimit from "express-rate-limit";

// Create a chatLimiter using rateLimit
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 50, // limit each user to 50 requests per window
  keyGenerator: (req) => req.user.id, // use user ID as the key for rate limiting
  message: { error: "You've sent too many messages. Please wait before sending another." },
  standardHeaders: true, // send RateLimit-* headers to the client
  legacyHeaders: false, // disable the older X-RateLimit-* headers
});

export default chatLimiter;
