const prisma = require("../prisma");
const { getAuthUserId, getCompanyIdOrThrow } = require("../core/request-context");
const { assertUuid, isUuid } = require("../core/validation");
const {
  isAdminOrAccountant,
  assertMaintenanceVehicleAccess,
} = require("./maintenance.access");

async function createMaintenanceRequest(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { vehicle_id, problem_title, problem_description } = req.body || {};

    assertUuid(vehicle_id, "vehicle_id");

    if (!problem_title || String(problem_title).trim().length < 2) {
      return res.status(400).json({ message: "problem_title is required" });
    }

    const vehicle = await prisma.vehicles.findFirst({
      where: {
        id: vehicle_id,
        company_id: companyId,
      },
      select: { id: true },
    });

    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    await assertMaintenanceVehicleAccess({ req, vehicleId: vehicle_id });

    const now = new Date();

    const row = await prisma.maintenance_requests.create({
      data: {
        company_id: companyId,
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
    const sc = e?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: e.message });
    console.error("CREATE MAINT REQUEST ERROR:", e);
    return res.status(500).json({ message: "Failed to create request" });
  }
}

async function listMaintenanceRequests(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { status, vehicle_id, page, limit } = req.query || {};
    const where = { company_id: companyId };

    if (status) where.status = String(status).toUpperCase();

    if (vehicle_id) {
      assertUuid(String(vehicle_id), "vehicle_id");
      where.vehicle_id = String(vehicle_id);
    }

    if (!isAdminOrAccountant(req)) {
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
    const sc = e?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: e.message });
    console.error("LIST MAINT REQUESTS ERROR:", e);
    return res.status(500).json({ message: "Failed to fetch requests" });
  }
}

async function getMaintenanceRequestById(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    assertUuid(id, "request id");

    const row = await prisma.maintenance_requests.findFirst({
      where: {
        id,
        company_id: companyId,
      },
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
        attachments: {
          where: { company_id: companyId },
        },
        work_orders: {
          where: { company_id: companyId },
          orderBy: { opened_at: "desc" },
          select: {
            id: true,
            status: true,
            type: true,
            maintenance_mode: true,
            vendor_id: true,
            opened_at: true,
            started_at: true,
            completed_at: true,
            odometer: true,
            notes: true,
            vendors: {
              select: {
                id: true,
                name: true,
                code: true,
                vendor_type: true,
                classification: true,
                status: true,
                phone: true,
                city: true,
              },
            },
          },
        },
      },
    });

    if (!row) return res.status(404).json({ message: "Maintenance request not found" });

    await assertMaintenanceVehicleAccess({ req, vehicleId: row.vehicle_id });

    return res.json({ request: row });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: e.message });
    console.error("GET MAINT REQUEST BY ID ERROR:", e);
    return res.status(500).json({ message: "Failed to fetch maintenance request" });
  }
}

async function approveMaintenanceRequest(req, res) {
  try {
    const actorId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can approve" });
    }

    const { id } = req.params;
    assertUuid(id, "request id");

    const { vendor_id, maintenance_mode, type, odometer, notes } = req.body || {};

    const reqRow = await prisma.maintenance_requests.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      select: {
        id: true,
        vehicle_id: true,
        status: true,
      },
    });

    if (!reqRow) return res.status(404).json({ message: "Request not found" });
    if (reqRow.status !== "SUBMITTED") {
      return res.status(409).json({ message: "Request is not SUBMITTED" });
    }

    let normalizedVendorId = null;
    if (vendor_id !== undefined && vendor_id !== null && String(vendor_id).trim() !== "") {
      assertUuid(String(vendor_id), "vendor_id");

      const vendor = await prisma.vendors.findFirst({
        where: {
          id: String(vendor_id),
          company_id: companyId,
        },
        select: { id: true },
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      normalizedVendorId = vendor.id;
    }

    const normalizedMaintenanceMode = maintenance_mode
      ? String(maintenance_mode).toUpperCase()
      : normalizedVendorId
      ? "EXTERNAL"
      : "INTERNAL";

    const normalizedType = type ? String(type).toUpperCase() : "CORRECTIVE";

    const normalizedOdometer =
      odometer === undefined || odometer === null || odometer === ""
        ? null
        : Number(odometer);

    if (
      normalizedOdometer !== null &&
      (!Number.isFinite(normalizedOdometer) || normalizedOdometer < 0)
    ) {
      return res.status(400).json({ message: "Invalid odometer" });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updatedReq = await tx.maintenance_requests.updateMany({
        where: {
          id,
          company_id: companyId,
        },
        data: {
          status: "APPROVED",
          reviewed_by: actorId,
          reviewed_at: now,
          updated_at: now,
        },
      });

      if (updatedReq.count !== 1) {
        const err = new Error("Request update failed");
        err.statusCode = 409;
        throw err;
      }

      const wo = await tx.maintenance_work_orders.create({
        data: {
          company_id: companyId,
          vehicle_id: reqRow.vehicle_id,
          request_id: reqRow.id,
          vendor_id: normalizedVendorId,
          status: "OPEN",
          type: normalizedType,
          maintenance_mode: normalizedMaintenanceMode,
          opened_at: now,
          odometer: normalizedOdometer,
          notes: notes ? String(notes).trim() : null,
          created_by: actorId,
          created_at: now,
          updated_at: now,
        },
        include: {
          vendors: {
            select: {
              id: true,
              name: true,
              code: true,
              vendor_type: true,
              classification: true,
              status: true,
              phone: true,
              city: true,
            },
          },
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
        },
      });

      const vehicleUpd = await tx.vehicles.updateMany({
        where: {
          id: reqRow.vehicle_id,
          company_id: companyId,
        },
        data: {
          status: "MAINTENANCE",
          updated_at: now,
        },
      });

      if (vehicleUpd.count !== 1) {
        const err = new Error("Vehicle update failed");
        err.statusCode = 409;
        throw err;
      }

      return { work_order: wo };
    });

    return res.json({
      message: "Request approved",
      ...result,
    });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: e.message });
    console.error("APPROVE MAINT REQUEST ERROR:", e);
    return res.status(500).json({ message: "Failed to approve request" });
  }
}

async function rejectMaintenanceRequest(req, res) {
  try {
    const actorId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can reject" });
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    assertUuid(id, "request id");

    if (!reason || String(reason).trim().length < 2) {
      return res.status(400).json({ message: "reason is required" });
    }

    const reqRow = await prisma.maintenance_requests.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      select: { id: true, status: true },
    });

    if (!reqRow) return res.status(404).json({ message: "Request not found" });
    if (reqRow.status !== "SUBMITTED") {
      return res.status(409).json({ message: "Request is not SUBMITTED" });
    }

    const now = new Date();

    const updated = await prisma.maintenance_requests.updateMany({
      where: {
        id,
        company_id: companyId,
      },
      data: {
        status: "REJECTED",
        reviewed_by: actorId,
        reviewed_at: now,
        rejection_reason: String(reason).trim(),
        updated_at: now,
      },
    });

    if (updated.count !== 1) {
      return res.status(409).json({ message: "Request update failed" });
    }

    const fresh = await prisma.maintenance_requests.findFirst({
      where: { id, company_id: companyId },
    });

    return res.json({ request: fresh });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: e.message });
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