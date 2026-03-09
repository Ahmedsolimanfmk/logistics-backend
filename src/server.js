// =======================
// src/server.js
// =======================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const { authRequired } = require("./auth/jwt.middleware");

// Routes
const authRoutes = require("./auth/auth.routes");
const vehiclesRoutes = require("./vehicles/vehicles.routes");
const tripsRoutes = require("./trips/trips.routes");
const driversRoutes = require("./drivers/drivers.routes");
const cashRoutes = require("./cash/cash.routes");
const reportsRoutes = require("./reports/reports.routes");
const dashboardRoutes = require("./dashboard/dashboard.routes");
const maintenanceRoutes = require("./maintenance/maintenance.routes");
const sitesRoutes = require("./sites/sites.routes");
const clientsRoutes = require("./clients/clients.routes");
const usersRoutes = require("./users/users.routes");
const supervisorsRoutes = require("./supervisors/supervisors.routes");
const inventoryRoutes = require("./inventory/inventory.routes");
const arRoutes = require("./finance/ar.routes");
const analyticsRoutes = require("./src/analytics/analytics.routes");

const app = express();
app.set("trust proxy", 1);

// =======================
// Body parsers
// =======================
const JSON_LIMIT = process.env.JSON_LIMIT || "2mb";
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// =======================
// CORS (production-ready)
// =======================
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsOriginCheck(origin, cb) {
  // origin can be undefined (server-to-server / curl), or sometimes "null"
  if (!origin || origin === "null") return cb(null, true);

  // If no allowlist configured, allow all
  if (allowedOrigins.length === 0) return cb(null, true);

  if (allowedOrigins.includes(origin)) return cb(null, true);

  const e = new Error("Not allowed by CORS");
  e.status = 403;
  e.code = "CORS_NOT_ALLOWED";
  return cb(e);
}

const corsOptions = {
  origin: corsOriginCheck,
  credentials: true,
};

app.use(cors(corsOptions));

// ✅ Express 5 / path-to-regexp: "*" breaks, use regex or "/*"
app.options(/.*/, cors(corsOptions));

app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("Origin:", req.headers.origin);
  }
  next();
});

// =======================
// Serve uploads
// =======================
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// =======================
// Public routes (NO auth)
// =======================
app.use("/auth", authRoutes);

// =======================
// Protected routes (JWT required)
// =======================
app.use("/vehicles", authRequired, vehiclesRoutes);
app.use("/trips", authRequired, tripsRoutes);
app.use("/drivers", authRequired, driversRoutes);
app.use("/users", authRequired, usersRoutes);
app.use("/supervisors", authRequired, supervisorsRoutes);
app.use("/cash", authRequired, cashRoutes);
app.use("/reports", authRequired, reportsRoutes);
app.use("/dashboard", authRequired, dashboardRoutes);
app.use("/maintenance", authRequired, maintenanceRoutes);
app.use("/inventory", authRequired, inventoryRoutes);
app.use("/finance/ar", authRequired, arRoutes);
app.use("/analytics", analyticsRoutes);

// Public (حسب قرارك)
app.use("/sites", sitesRoutes);
app.use("/clients", clientsRoutes);

// =======================
// Health check
// =======================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Logistics Backend API",
  });
});

// =======================
// 404 handler
// =======================
app.use((req, res) => {
  res.status(404).json({
    message: `Not Found: ${req.method} ${req.originalUrl}`,
  });
});

// =======================
// Error handler
// =======================
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);

  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Internal Server Error",
    code: err.code || undefined,
  });
});

// =======================
// Start server (Cloud Run compatible)
// =======================
const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 API running on port ${PORT}`);
});