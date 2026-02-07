// =======================
// src/maintenance/maintenance.requests.controller.js
// =======================

const prisma = require("./prisma");

// ---------- helpers ----------
function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

function roleUpper(role) {
  return String(role || "").toUpperCase();
}

function isAdminOrAccountant(role) {
  return ["ADMIN", "ACCOUNTANT"].includes(roleUpper(role));
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

// المشرف يقدر يشتغل بس على عربياته
async function assertVehicleInSupervisorPortfolio({ vehicle_id, userId }) {
  const row = await prisma.vehicle_portfolio.findFirst({
    where: {
      vehicle_id,
      field_supervisor_id: userId,
      is_active: true,
    },
    select: { id: true },
  });

  return !!row;
}

// =======================
// POST /maintenance/requests
// =======================
async function createMaintenanceRequest(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { vehicle_id, problem_title, problem_description } = req.body || {};

    if (!isUuid(vehicle_id)) {
      return res.status(400).json({ message: "vehicle_id must be uuid" });
    }
    if (!problem_title || String(problem_title).trim().length < 2) {
      return res.status(400).json({ message: "problem_title is required" });
    }

    const vehicle = await prisma.vehicles.findUnique({
      where: { id: vehicle_id },
      select: { id: true },
    });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    const role = req.user?.role || null;
    if (!isAdminOrAccountant(role)) {
      const ok = await assertVehicleInSupervisorPortfolio({ vehicle_id, userId });
      if (!ok) {
        return res.status(403).json({ message: "Forbidden: vehicle not in your portfolio" });
      }
    }

    const now = new Date();

    const row = await prisma.maintenance_requests.create({
      data: {
        vehicle_id,
        problem_title: String(problem_title).trim(),
        problem_description: problem_description
          ? String(problem_description).trim()
          : null,
        status: "SUBMITTED",
        requested_by: userId,
        requested_at: now,
        created_at: now,
        updated_at: now,
      },
    });

    return res.status(201).json(row);
  } catch (e) {
    console.error("CREATE MAINT REQUEST ERROR:", e);
    return res.status(500).json({ message: "Failed to create request" });
  }
}

// =======================
// GET /maintenance/requests
// =======================
async function listMaintenanceRequests(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { status, vehicle_id, page, limit } = req.query || {};
    const role = req.user?.role || null;

    const where = {};
    if (status) where.status = String(status).toUpperCase();
    if (vehicle_id) {
      if (!isUuid(vehicle_id)) return res.status(400).json({ message: "vehicle_id must be uuid" });
      where.vehicle_id = vehicle_id;
    }

    if (!isAdminOrAccountant(role)) {
      where.requested_by = userId;
    }

    const pageNum = Math.max(1, Number(page || 1));
    const limitNum = Math.min(100, Math.max(1, Number(limit || 20)));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      prisma.maintenance_requests.findMany({
        where,
        orderBy: { requested_at: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.maintenance_requests.count({ where }),
    ]);

    return res.json({
      items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (e) {
    console.error("LIST MAINT REQUESTS ERROR:", e);
    return res.status(500).json({ message: "Failed to fetch requests" });
  }
}

// =======================
// GET /maintenance/requests/:id
// =======================
async function getMaintenanceRequestById(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const row = await prisma.maintenance_requests.findUnique({
      where: { id },
      include: {
        vehicles: {
          select: {
            id: true,
            fleet_no: true,
            plate_no: true,
            display_name: true,
            status: true,
            current_odometer: true,
          },
        },
        requested_by_user: {
          select: { id: true, full_name: true },
        },
        reviewed_by_user: {
          select: { id: true, full_name: true },
        },
        attachments: true,
        work_orders: {
          orderBy: { opened_at: "desc" },
          select: {
            id: true,
            status: true,
            type: true,
            vendor_name: true,
            opened_at: true,
            started_at: true,
            completed_at: true,
            odometer: true,
            notes: true,
          },
        },
      },
    });

    if (!row) return res.status(404).json({ message: "Maintenance request not found" });

    const role = req.user?.role || null;
    if (!isAdminOrAccountant(role)) {
      const ok = await assertVehicleInSupervisorPortfolio({
        vehicle_id: row.vehicle_id,
        userId,
      });
      if (!ok) return res.status(403).json({ message: "Forbidden" });
    }

    return res.json({ request: row });
  } catch (e) {
    console.error("GET MAINT REQUEST BY ID ERROR:", e);
    return res.status(500).json({ message: "Failed to fetch maintenance request" });
  }
}

// =======================
// POST /maintenance/requests/:id/approve
// =======================
async function approveMaintenanceRequest(req, res) {
  try {
    const actorId = getAuthUserId(req);
    const role = req.user?.role || null;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(role)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can approve" });
    }

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid request id" });

    const reqRow = await prisma.maintenance_requests.findUnique({ where: { id } });
    if (!reqRow) return res.status(404).json({ message: "Request not found" });

    if (reqRow.status !== "SUBMITTED") {
      return res.status(409).json({ message: "Request is not SUBMITTED" });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updatedReq = await tx.maintenance_requests.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewed_by: actorId,
          reviewed_at: now,
          updated_at: now,
        },
      });

      const wo = await tx.maintenance_work_orders.create({
        data: {
          vehicle_id: reqRow.vehicle_id,
          request_id: reqRow.id, // 🔗 الربط المهم
          status: "OPEN",
          opened_at: now,
          created_by: actorId,
          created_at: now,
          updated_at: now,
        },
      });

      await tx.vehicles.update({
        where: { id: reqRow.vehicle_id },
        data: { status: "MAINTENANCE", updated_at: now },
      });

      return { request: updatedReq, work_order: wo };
    });

    return res.json(result);
  } catch (e) {
    console.error("APPROVE MAINT REQUEST ERROR:", e);
    return res.status(500).json({ message: "Failed to approve request" });
  }
}

// =======================
// POST /maintenance/requests/:id/reject
// =======================
async function rejectMaintenanceRequest(req, res) {
  try {
    const actorId = getAuthUserId(req);
    const role = req.user?.role || null;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(role)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can reject" });
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    if (!isUuid(id)) return res.status(400).json({ message: "Invalid request id" });
    if (!reason || String(reason).trim().length < 2) {
      return res.status(400).json({ message: "reason is required" });
    }

    const reqRow = await prisma.maintenance_requests.findUnique({ where: { id } });
    if (!reqRow) return res.status(404).json({ message: "Request not found" });

    if (reqRow.status !== "SUBMITTED") {
      return res.status(409).json({ message: "Request is not SUBMITTED" });
    }

    const now = new Date();

    const updated = await prisma.maintenance_requests.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewed_by: actorId,
        reviewed_at: now,
        rejection_reason: String(reason).trim(),
        updated_at: now,
      },
    });

    return res.json({ request: updated });
  } catch (e) {
    console.error("REJECT MAINT REQUEST ERROR:", e);
    return res.status(500).json({ message: "Failed to reject request" });
  }
}

module.exports = {
  createMaintenanceRequest,
  listMaintenanceRequests,
  getMaintenanceRequestById,
  approveMaintenanceRequest,
  rejectMaintenanceRequest,
};
