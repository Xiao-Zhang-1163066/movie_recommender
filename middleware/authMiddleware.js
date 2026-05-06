import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";

const protect = async (req, res, next) => {
  //1. Get token from cookies
  const token = req.cookies.jwt;
  //2. Check if token exists
  if (!token) {
    return res.status(401).json({ error: "Not autherized" });
  }
  //3. Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    //4. find the user
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
};

export { protect };
