const prisma = require("../prisma");
const {
  getAuthUserId,
  getCompanyIdOrThrow,
} = require("../core/request-context");
const { isAdminOrAccountant } = require("./maintenance.access");

function buildLabel(v) {
  const fn = v?.fleet_no ? String(v.fleet_no).trim() : "";
  const pn = v?.plate_no ? String(v.plate_no).trim() : "";
  const dn = v?.display_name ? String(v.display_name).trim() : "";

  if (fn && pn) return `${fn} - ${pn}`;
  if (fn) return fn;
  if (pn) return pn;
  return dn || v?.id;
}

function isExpiredDate(dateValue) {
  if (!dateValue) return false;

  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;

  return d.getTime() < Date.now();
}

function asOption(v) {
  return {
    id: v.id,
    label: buildLabel(v),
    status: v.status,
    license_expiry_date: v.license_expiry_date || null,
    disable_reason: v.disable_reason || null,
  };
}

// GET /maintenance/vehicles/options
async function listVehicleOptions(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (isAdminOrAccountant(req)) {
      const rows = await prisma.vehicles.findMany({
        where: {
          company_id: companyId,
        },
        orderBy: [{ fleet_no: "asc" }, { plate_no: "asc" }],
        select: {
          id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
          status: true,
          license_expiry_date: true,
          disable_reason: true,
        },
      });

      const items = rows
        .filter((v) => !isExpiredDate(v.license_expiry_date))
        .map(asOption);

      return res.json({ items });
    }

    const rows = await prisma.vehicle_portfolio.findMany({
      where: {
        company_id: companyId,
        field_supervisor_id: userId,
        is_active: true,
      },
      orderBy: { created_at: "desc" },
      select: {
        vehicles: {
          select: {
            id: true,
            fleet_no: true,
            plate_no: true,
            display_name: true,
            status: true,
            license_expiry_date: true,
            disable_reason: true,
          },
        },
      },
    });

    const items = rows
      .map((r) => r.vehicles)
      .filter(Boolean)
      .filter((v) => !isExpiredDate(v.license_expiry_date))
      .map(asOption);

    return res.json({ items });
  } catch (e) {
    console.error("LIST VEHICLE OPTIONS ERROR:", e);

    const sc = e?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({
        message: e.message,
      });
    }

    return res.status(500).json({
      message: "Failed to load vehicle options",
      error: e?.message || String(e),
      code: e?.code,
      meta: e?.meta,
    });
  }
}

module.exports = {
  listVehicleOptions,
};