import jwt from "jsonwebtoken";
export const generateToken = (userID, res) => {
  const payload = { id: userID };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // Prevent CSRF
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return token;
};
