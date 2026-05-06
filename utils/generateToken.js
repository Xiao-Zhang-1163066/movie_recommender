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
    maxAge: 3600000, // 1 hour in milliseconds
  });
  return token;
};
