const prisma = require("../db/prisma");

// Get all maintenance requests
exports.getAllRequests = async (req, res) => {
  try {
    const { company_id } = req.user;
    const requests = await prisma.maintenance_requests.findMany({
      where: { company_id },
      include: {
        vehicle: { select: { plate_no: true, display_name: true, fleet_no: true } },
        requested_by_user: { select: { full_name: true } },
        reviewed_by_user: { select: { full_name: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch maintenance requests" });
  }
};

// Update request status (e.g. APPROVE or REJECT)
exports.updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id, id: user_id } = req.user;
    const { status, rejection_reason } = req.body; // APPROVED, REJECTED, etc.

    const request = await prisma.maintenance_requests.update({
      where: { id, company_id },
      data: {
        status,
        rejection_reason,
        reviewed_by: user_id,
        reviewed_at: new Date(),
      },
    });
    res.json({ message: "Request updated successfully", request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update request" });
  }
};

// Get all work orders
exports.getAllWorkOrders = async (req, res) => {
  try {
    const { company_id } = req.user;
    const workOrders = await prisma.maintenance_work_orders.findMany({
      where: { company_id },
      include: {
        vehicle: { select: { plate_no: true, display_name: true, fleet_no: true } },
        request: { select: { problem_title: true, problem_description: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json(workOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch work orders" });
  }
};

// Get specific work order
exports.getWorkOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;
    const workOrder = await prisma.maintenance_work_orders.findUnique({
      where: { id, company_id },
      include: {
        vehicle: { select: { plate_no: true, display_name: true, fleet_no: true } },
        request: true,
        vendor: { select: { name: true } },
        installations: {
          include: { part: true }
        }
      },
    });
    if (!workOrder) return res.status(404).json({ error: "Work order not found" });
    res.json(workOrder);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch work order" });
  }
};

// Create a new work order
exports.createWorkOrder = async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const { vehicle_id, request_id, type, maintenance_mode, vendor_id, notes } = req.body;

    const workOrder = await prisma.maintenance_work_orders.create({
      data: {
        company_id,
        vehicle_id,
        request_id,
        type: type || "CORRECTIVE",
        maintenance_mode: maintenance_mode || "INTERNAL",
        vendor_id: vendor_id || null,
        notes,
        created_by: user_id,
        status: "OPEN",
        opened_at: new Date()
      },
    });

    if (request_id) {
      // Update request to IN_PROGRESS
      await prisma.maintenance_requests.update({
        where: { id: request_id },
        data: { status: "IN_PROGRESS" }
      });
    }

    res.status(201).json({ message: "Work order created successfully", workOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create work order" });
  }
};

// Update work order
exports.updateWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;
    const { status, notes, odometer } = req.body;

    const updateData = { status, notes, odometer };
    if (status === "IN_PROGRESS") updateData.started_at = new Date();
    if (status === "COMPLETED") updateData.completed_at = new Date();
    if (status === "CANCELLED") updateData.cancelled_at = new Date();

    const workOrder = await prisma.maintenance_work_orders.update({
      where: { id, company_id },
      data: updateData
    });

    res.json({ message: "Work order updated", workOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update work order" });
  }
};

// Add part to work order
exports.addWorkOrderPart = async (req, res) => {
  try {
    const { id } = req.params; // Work order ID
    const { company_id } = req.user;
    const { part_id, qty_installed, notes } = req.body;

    const workOrder = await prisma.maintenance_work_orders.findUnique({
      where: { id, company_id }
    });

    if (!workOrder) return res.status(404).json({ error: "Work order not found" });

    const installation = await prisma.work_order_installations.create({
      data: {
        company_id,
        work_order_id: id,
        vehicle_id: workOrder.vehicle_id,
        part_id,
        qty_installed,
        notes,
        installation_type: "NEW"
      }
    });

    res.json({ message: "Part installed successfully", installation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add part" });
  }
};

// Fetch parts catalog for installations
exports.getPartsCatalog = async (req, res) => {
  try {
    const { company_id } = req.user;
    const parts = await prisma.parts.findMany({
      where: { company_id, is_active: true }
    });
    res.json(parts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch parts" });
  }
};
