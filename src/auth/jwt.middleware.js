// =======================
// src/middleware/jwt.middleware.js
// =======================

const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Missing Authorization: Bearer <token>",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // decoded = { sub, role, email?, iat, exp }
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

module.exports = { authRequired };
