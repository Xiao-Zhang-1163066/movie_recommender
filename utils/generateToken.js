import jwt from "jsonwebtoken";

// Switched from httpOnly cookie to returned token (Bearer auth).
// The cookie approach broke on Safari iOS — SameSite=None cookies are blocked
// cross-origin by Safari's ITP when the frontend (SWA) and backend (Container App)
// are on different domains. Token is now stored in localStorage by the frontend.
// Future upgrade: move to access token (memory) + refresh token (httpOnly cookie)
// once the SWA linked backend proxy is in place (makes cookies first-party).
export const generateToken = (userID) => {
  const payload = { id: userID };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  return token;
};
