// src/middleware/jwt.middleware.js

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

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server misconfigured: JWT_SECRET missing",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      sub: decoded.sub,
      role: decoded.role,
      effective_role: decoded.effective_role || decoded.role,
      platform_role: decoded.platform_role || "USER",
      email: decoded.email || null,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

module.exports = { authRequired };