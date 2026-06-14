const prisma = require("../prisma");

// =====================
// ASSIGN DRIVER TO VEHICLE
// =====================
exports.assignDriver = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { vehicle_id, driver_id, notes } = req.body;

    // 1. Unassign any currently active assignment for this vehicle OR this driver
    await prisma.vehicle_driver_assignments.updateMany({
      where: {
        company_id: companyId,
        is_active: true,
        OR: [
          { vehicle_id },
          { driver_id }
        ]
      },
      data: {
        is_active: false,
        unassigned_at: new Date()
      }
    });

    // 2. Create the new assignment
    const assignment = await prisma.vehicle_driver_assignments.create({
      data: {
        company_id: companyId,
        vehicle_id,
        driver_id,
        notes,
        is_active: true,
        assigned_at: new Date()
      },
      include: {
        driver: { select: { full_name: true } },
        vehicle: { select: { plate_no: true } }
      }
    });

    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
};

// =====================
// GET ACTIVE ASSIGNMENTS
// =====================
exports.getActiveAssignments = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { vehicle_id, driver_id } = req.query;

    const assignments = await prisma.vehicle_driver_assignments.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        ...(vehicle_id ? { vehicle_id } : {}),
        ...(driver_id ? { driver_id } : {})
      },
      include: {
        driver: { select: { id: true, full_name: true, phone: true } },
        vehicle: { select: { id: true, plate_no: true, model: true } },
        custody_items: {
          where: { is_returned: false }
        }
      },
      orderBy: { assigned_at: "desc" }
    });

    res.json(assignments);
  } catch (error) {
    next(error);
  }
};

// =====================
// UNASSIGN
// =====================
exports.unassignDriver = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const assignment = await prisma.vehicle_driver_assignments.findUnique({
      where: { id },
      include: { custody_items: { where: { is_returned: false } } }
    });

    if (!assignment || assignment.company_id !== companyId) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (assignment.custody_items.length > 0) {
      return res.status(400).json({ 
        message: "Cannot unassign driver. There are unreturned physical custody items."
      });
    }

    await prisma.vehicle_driver_assignments.update({
      where: { id },
      data: {
        is_active: false,
        unassigned_at: new Date()
      }
    });

    res.json({ message: "Driver unassigned successfully" });
  } catch (error) {
    next(error);
  }
};

// =====================
// ADD PHYSICAL CUSTODY ITEM
// =====================
exports.addCustodyItem = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { assignment_id } = req.params;
    const { item_name, qty, condition, notes } = req.body;

    const assignment = await prisma.vehicle_driver_assignments.findUnique({
      where: { id: assignment_id }
    });

    if (!assignment || assignment.company_id !== companyId || !assignment.is_active) {
      return res.status(404).json({ message: "Active assignment not found" });
    }

    const item = await prisma.vehicle_driver_custody.create({
      data: {
        company_id: companyId,
        assignment_id,
        item_name,
        qty: parseInt(qty || "1"),
        condition,
        notes,
        is_returned: false
      }
    });

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

// =====================
// RETURN CUSTODY ITEM
// =====================
exports.returnCustodyItem = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const item = await prisma.vehicle_driver_custody.findUnique({ where: { id } });

    if (!item || item.company_id !== companyId) {
      return res.status(404).json({ message: "Custody item not found" });
    }

    await prisma.vehicle_driver_custody.update({
      where: { id },
      data: {
        is_returned: true,
        returned_at: new Date()
      }
    });

    res.json({ message: "Item returned successfully" });
  } catch (error) {
    next(error);
  }
};
