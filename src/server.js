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
const analyticsRoutes = require("./analytics/analytics.routes");
const aiAnalyticsRoutes = require("./ai-analytics/ai-analytics.routes");
const tripRevenuesRoutes = require("./trip-revenues/trip-revenues.routes");
const vendorsRoutes = require("./vendors/vendors.routes");
const contractsRoutes = require("./contracts/contracts.routes");
const pricingRoutes = require("./pricing/pricing.routes");
const contractPricingRoutes = require("./contract-pricing/contract-pricing.routes");

const app = express();
app.set("trust proxy", 1);

// =======================
// Body parsers
// =======================
const JSON_LIMIT = process.env.JSON_LIMIT || "2mb";
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// =======================
// CORS
// =======================
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsOriginCheck(origin, cb) {
  if (!origin || origin === "null") return cb(null, true);
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
// Public routes
// =======================
app.use("/auth", authRoutes);

// =======================
// Protected routes
// =======================
app.use("/vehicles", authRequired, vehiclesRoutes);
app.use("/trips", authRequired, tripsRoutes);
app.use("/trips", authRequired, tripRevenuesRoutes);
app.use("/drivers", authRequired, driversRoutes);
app.use("/users", authRequired, usersRoutes);
app.use("/supervisors", authRequired, supervisorsRoutes);
app.use("/cash", authRequired, cashRoutes);
app.use("/reports", authRequired, reportsRoutes);
app.use("/dashboard", authRequired, dashboardRoutes);
app.use("/maintenance", authRequired, maintenanceRoutes);
app.use("/inventory", authRequired, inventoryRoutes);
app.use("/finance/ar", authRequired, arRoutes);
app.use("/analytics", authRequired, analyticsRoutes);
app.use("/ai-analytics", authRequired, aiAnalyticsRoutes);
app.use("/vendors", authRequired, vendorsRoutes);
app.use("/contracts", authRequired, contractsRoutes);
app.use("/pricing-rules", authRequired, pricingRoutes);
app.use("/contract-pricing", authRequired, contractPricingRoutes);

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
// Start server
// =======================
const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 API running on port ${PORT}`);
});