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

const app = express();

// =======================
// CORS (production-ready)
// =======================
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      // Allow requests without origin (Postman, server-to-server)
      if (!origin) return cb(null, true);

      // If no origin specified yet, allow all (temporary)
      if (allowedOrigins.length === 0) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

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
  res.status(500).json({
    message: "Internal Server Error",
  });
});

// =======================
// Start server
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
