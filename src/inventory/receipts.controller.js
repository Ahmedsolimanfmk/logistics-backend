// src/inventory/receipts.controller.js

const prisma = require("../maintenance/prisma");
const {
  getUserId,
  isAdminOrAccountant,
  isAdminOrStorekeeper,
} = require("../auth/access");

// -----------------------
// Validation helpers
// -----------------------
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function toMoney(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function dedupeCheck(list) {
  const s = new Set();
  for (const x of list) {
    if (!x) continue;
    const k = String(x).trim();
    if (!k) continue;
    if (s.has(k)) return k;
    s.add(k);
  }
  return null;
}

function buildError(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function isPrismaModelMissingByName(err, modelName) {
  const msg = String(err?.message || "");
  return (
    msg.includes(String(modelName)) &&
    (
      msg.includes("is not a function") ||
      msg.includes("Unknown arg") ||
      msg.includes("Unknown field") ||
      msg.includes("does not exist") ||
      msg.includes("Invalid `prisma.")
    )
  );
}

function isPrismaMissingAnyBulkModel(err) {
  return (
    isPrismaModelMissingByName(err, "inventory_receipt_bulk_lines") ||
    isPrismaModelMissingByName(err, "warehouse_parts")
  );
}

function normalizeReceiptStatus(v) {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return "";
  if (s === "ALL") return "ALL";
  if (["DRAFT", "SUBMITTED", "POSTED", "CANCELLED"].includes(s)) return s;
  return null;
}

async function assertWarehouseBelongsToCompany(tx, companyId, warehouseId) {
  const row = await tx.warehouses.findFirst({
    where: {
      id: warehouseId,
      company_id: companyId,
    },
    select: { id: true, company_id: true, is_active: true },
  });

  if (!row) {
    throw buildError("Warehouse not found", 404);
  }

  return row;
}

async function assertVendorBelongsToCompany(tx, companyId, vendorId) {
  if (!vendorId) return null;

  const row = await tx.vendors.findFirst({
    where: {
      id: vendorId,
      company_id: companyId,
    },
    select: { id: true, company_id: true, name: true },
  });

  if (!row) {
    throw buildError("Vendor not found", 404);
  }

  return row;
}

async function assertPartsBelongToCompany(tx, companyId, partIds) {
  if (!Array.isArray(partIds) || partIds.length === 0) return;

  const uniqueIds = Array.from(new Set(partIds.filter(Boolean)));
  if (!uniqueIds.length) return;

  const rows = await tx.parts.findMany({
    where: {
      company_id: companyId,
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  if (rows.length !== uniqueIds.length) {
    throw buildError("One or more parts not found", 404);
  }
}

function receiptIncludeWithBulk() {
  return {
    warehouse: true,
    vendor: true,
    items: {
      include: {
        part: true,
      },
    },
    bulk_lines: {
      include: {
        part: true,
      },
    },
    cash_expenses: true,
    created_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
    submitted_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
    approved_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
  };
}

function receiptIncludeWithoutBulk() {
  return {
    warehouse: true,
    vendor: true,
    items: {
      include: {
        part: true,
      },
    },
    cash_expenses: true,
    created_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
    submitted_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
    approved_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
  };
}

// -----------------------
// Controllers
// -----------------------
async function listReceipts(req, res) {
  try {
    const companyId = req.companyId;
    const statusRaw = String(req.query.status || "").trim();
    const warehouse_id = String(req.query.warehouse_id || "").trim();

    if (!companyId || !isUuid(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    if (warehouse_id && !isUuid(warehouse_id)) {
      return res.status(400).json({ message: "warehouse_id is invalid" });
    }

    const status = normalizeReceiptStatus(statusRaw);
    if (status === null) {
      return res.status(400).json({
        message: "Invalid status. Allowed: DRAFT | SUBMITTED | POSTED | CANCELLED",
      });
    }
    if (status === "ALL") {
      return res.status(400).json({
        message: "status=ALL is not allowed. Omit status to fetch all receipts.",
      });
    }

    const where = {
      company_id: companyId,
    };

    if (status) where.status = status;
    if (warehouse_id) where.warehouse_id = warehouse_id;

    let rows;
    try {
      rows = await prisma.inventory_receipts.findMany({
        where,
        orderBy: [{ created_at: "desc" }],
        include: receiptIncludeWithBulk(),
        take: 200,
      });
    } catch (e) {
      if (
        !isPrismaMissingAnyBulkModel(e) &&
        !isPrismaModelMissingByName(e, "bulk_lines")
      ) {
        throw e;
      }

      rows = await prisma.inventory_receipts.findMany({
        where,
        orderBy: [{ created_at: "desc" }],
        include: receiptIncludeWithoutBulk(),
        take: 200,
      });
    }

    return res.json({ items: rows });
  } catch (err) {
    console.error("listReceipts error:", err);
    return res.status(500).json({ message: "Failed to list receipts" });
  }
}

async function getReceipt(req, res) {
  try {
    const companyId = req.companyId;
    const id = String(req.params.id || "").trim();

    if (!companyId || !isUuid(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    let row;
    try {
      row = await prisma.inventory_receipts.findFirst({
        where: {
          id,
          company_id: companyId,
        },
        include: receiptIncludeWithBulk(),
      });
    } catch (e) {
      if (
        !isPrismaMissingAnyBulkModel(e) &&
        !isPrismaModelMissingByName(e, "bulk_lines")
      ) {
        throw e;
      }

      row = await prisma.inventory_receipts.findFirst({
        where: {
          id,
          company_id: companyId,
        },
        include: receiptIncludeWithoutBulk(),
      });
    }

    if (!row) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    return res.json(row);
  } catch (err) {
    console.error("getReceipt error:", err);
    return res.status(500).json({ message: "Failed to get receipt" });
  }
}

async function createReceipt(req, res) {
  try {
    const companyId = req.companyId;
    const created_by = getUserId(req);

    if (!companyId || !isUuid(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    const warehouse_id = String(req.body?.warehouse_id || "").trim();
    const vendor_id =
      req.body?.vendor_id != null ? String(req.body.vendor_id).trim() : null;
    const invoice_no =
      req.body?.invoice_no != null ? String(req.body.invoice_no).trim() : null;
    const reference_no =
      req.body?.reference_no != null ? String(req.body.reference_no).trim() : null;

    const invoice_date =
      req.body?.invoice_date != null && String(req.body.invoice_date).trim()
        ? new Date(String(req.body.invoice_date).trim())
        : null;

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const bulk_lines = Array.isArray(req.body?.bulk_lines)
      ? req.body.bulk_lines
      : [];

    if (!isUuid(warehouse_id)) {
      return res.status(400).json({ message: "warehouse_id is required" });
    }

    if (vendor_id && !isUuid(vendor_id)) {
      return res.status(400).json({ message: "vendor_id is invalid" });
    }

    if (invoice_date && Number.isNaN(invoice_date.getTime())) {
      return res.status(400).json({ message: "invoice_date is invalid" });
    }

    if ((!items || items.length === 0) && (!bulk_lines || bulk_lines.length === 0)) {
      return res.status(400).json({
        message: "Receipt must include items or bulk_lines",
      });
    }

    for (const [i, it] of items.entries()) {
      const part_id = String(it?.part_id || "").trim();
      const internal_serial = String(it?.internal_serial || "").trim();
      const manufacturer_serial =
        it?.manufacturer_serial != null
          ? String(it.manufacturer_serial).trim()
          : "";

      if (!isUuid(part_id)) {
        return res.status(400).json({ message: `items[${i}].part_id is invalid` });
      }
      if (!internal_serial) {
        return res.status(400).json({
          message: `items[${i}].internal_serial is required`,
        });
      }

      const uc = toMoney(it?.unit_cost);
      if (it?.unit_cost != null && it?.unit_cost !== "" && uc == null) {
        return res
          .status(400)
          .json({ message: `items[${i}].unit_cost is invalid` });
      }

      if (manufacturer_serial === "") {
        // manufacturer_serial optional in Prisma schema
      }
    }

    const dup1 = dedupeCheck(items.map((x) => x?.internal_serial));
    if (dup1) {
      return res
        .status(400)
        .json({ message: `Duplicate internal_serial in payload: ${dup1}` });
    }

    const manufacturerSerials = items
      .map((x) => (x?.manufacturer_serial != null ? String(x.manufacturer_serial).trim() : ""))
      .filter(Boolean);

    const dup2 = dedupeCheck(manufacturerSerials);
    if (dup2) {
      return res.status(400).json({
        message: `Duplicate manufacturer_serial in payload: ${dup2}`,
      });
    }

    for (const [i, bl] of bulk_lines.entries()) {
      const part_id = String(bl?.part_id || "").trim();
      const qty = bl?.qty == null ? 0 : Number(bl.qty);

      if (!isUuid(part_id)) {
        return res
          .status(400)
          .json({ message: `bulk_lines[${i}].part_id is invalid` });
      }

      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({
          message: `bulk_lines[${i}].qty must be > 0`,
        });
      }

      const uc = toMoney(bl?.unit_cost);
      if (bl?.unit_cost != null && bl?.unit_cost !== "" && uc == null) {
        return res.status(400).json({
          message: `bulk_lines[${i}].unit_cost is invalid`,
        });
      }
    }

    let created;

    try {
      created = await prisma.$transaction(async (tx) => {
        await assertWarehouseBelongsToCompany(tx, companyId, warehouse_id);
        await assertVendorBelongsToCompany(tx, companyId, vendor_id);

        await assertPartsBelongToCompany(
          tx,
          companyId,
          [
            ...items.map((x) => String(x?.part_id || "").trim()),
            ...bulk_lines.map((x) => String(x?.part_id || "").trim()),
          ]
        );

        const existingSerial = await tx.part_items.findFirst({
          where: {
            company_id: companyId,
            OR: [
              {
                internal_serial: {
                  in: items.map((x) => String(x.internal_serial || "").trim()).filter(Boolean),
                },
              },
              {
                manufacturer_serial: {
                  in: manufacturerSerials,
                },
              },
            ],
          },
          select: {
            internal_serial: true,
            manufacturer_serial: true,
          },
        });

        if (existingSerial) {
          throw buildError(
            `Serial already exists: ${existingSerial.internal_serial || existingSerial.manufacturer_serial}`,
            409
          );
        }

        let createdReceipt;

        try {
          createdReceipt = await tx.inventory_receipts.create({
            data: {
              company_id: companyId,
              warehouse_id,
              vendor_id,
              invoice_no,
              reference_no,
              invoice_date,
              status: "DRAFT",
              created_by: created_by || null,
              items: {
                create: items.map((it) => ({
                  company_id: companyId,
                  part_id: String(it.part_id).trim(),
                  internal_serial: String(it.internal_serial).trim(),
                  manufacturer_serial:
                    it?.manufacturer_serial != null && String(it.manufacturer_serial).trim()
                      ? String(it.manufacturer_serial).trim()
                      : null,
                  unit_cost: toMoney(it.unit_cost),
                  notes: it?.notes != null ? String(it.notes).trim() : null,
                })),
              },
              bulk_lines: {
                create: bulk_lines.map((bl) => {
                  const qty = Number(bl.qty);
                  const unit_cost = toMoney(bl.unit_cost);
                  const total_cost =
                    unit_cost == null ? null : toMoney(unit_cost * qty);

                  return {
                    company_id: companyId,
                    part_id: String(bl.part_id).trim(),
                    qty,
                    unit_cost,
                    total_cost,
                    notes: bl?.notes != null ? String(bl.notes).trim() : null,
                  };
                }),
              },
            },
            include: receiptIncludeWithBulk(),
          });
        } catch (e) {
          if (
            !isPrismaMissingAnyBulkModel(e) &&
            !isPrismaModelMissingByName(e, "bulk_lines")
          ) {
            throw e;
          }

          createdReceipt = await tx.inventory_receipts.create({
            data: {
              company_id: companyId,
              warehouse_id,
              vendor_id,
              invoice_no,
              reference_no,
              invoice_date,
              status: "DRAFT",
              created_by: created_by || null,
              items: {
                create: items.map((it) => ({
                  company_id: companyId,
                  part_id: String(it.part_id).trim(),
                  internal_serial: String(it.internal_serial).trim(),
                  manufacturer_serial:
                    it?.manufacturer_serial != null && String(it.manufacturer_serial).trim()
                      ? String(it.manufacturer_serial).trim()
                      : null,
                  unit_cost: toMoney(it.unit_cost),
                  notes: it?.notes != null ? String(it.notes).trim() : null,
                })),
              },
            },
            include: receiptIncludeWithoutBulk(),
          });

          if (bulk_lines.length) {
            throw buildError(
              "bulk_lines provided but Prisma schema/models for bulk are not available. Apply migration for warehouse_parts & inventory_receipt_bulk_lines first.",
              400
            );
          }
        }

        return createdReceipt;
      });
    } catch (err) {
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }

    return res.status(201).json(created);
  } catch (err) {
    if (String(err?.code) === "P2002") {
      return res.status(409).json({
        message: "Unique constraint failed (possibly invoice/serial duplication)",
      });
    }

    console.error("createReceipt error:", err);
    return res.status(500).json({ message: "Failed to create receipt" });
  }
}

async function submitReceipt(req, res) {
  try {
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ACCOUNTANT/ADMIN can submit receipts",
      });
    }

    const companyId = req.companyId;
    const id = String(req.params.id || "").trim();
    const userId = getUserId(req);

    if (!companyId || !isUuid(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      let receipt;

      try {
        receipt = await tx.inventory_receipts.findFirst({
          where: {
            id,
            company_id: companyId,
          },
          include: { items: true, bulk_lines: true },
        });
      } catch (e) {
        if (
          !isPrismaMissingAnyBulkModel(e) &&
          !isPrismaModelMissingByName(e, "bulk_lines")
        ) {
          throw e;
        }

        receipt = await tx.inventory_receipts.findFirst({
          where: {
            id,
            company_id: companyId,
          },
          include: { items: true },
        });
      }

      if (!receipt) {
        throw buildError("Receipt not found", 404);
      }

      if (receipt.status !== "DRAFT") {
        throw buildError("Only DRAFT receipts can be submitted", 400);
      }

      const safeItems = Array.isArray(receipt.items) ? receipt.items : [];
      const safeBulkLines = Array.isArray(receipt.bulk_lines) ? receipt.bulk_lines : [];

      if (!safeItems.length && !safeBulkLines.length) {
        throw buildError("Receipt has no items", 400);
      }

      return tx.inventory_receipts.update({
        where: { id: receipt.id },
        data: {
          status: "SUBMITTED",
          submitted_at: new Date(),
          submitted_by: userId || null,
        },
      });
    });

    return res.json({ message: "Receipt submitted", receipt: updated });
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: String(err.message || "Error") });
    }

    console.error("submitReceipt error:", err);
    return res.status(500).json({ message: "Failed to submit receipt" });
  }
}

async function postReceipt(req, res) {
  try {
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ACCOUNTANT/ADMIN can post receipts",
      });
    }

    const companyId = req.companyId;
    const userId = getUserId(req);
    const id = String(req.params.id || "").trim();

    if (!companyId || !isUuid(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const result = await prisma.$transaction(async (tx) => {
      let receipt;

      try {
        receipt = await tx.inventory_receipts.findFirst({
          where: {
            id,
            company_id: companyId,
          },
          include: {
            items: true,
            bulk_lines: true,
            vendor: true,
          },
        });
      } catch (e) {
        if (
          !isPrismaMissingAnyBulkModel(e) &&
          !isPrismaModelMissingByName(e, "bulk_lines")
        ) {
          throw e;
        }

        receipt = await tx.inventory_receipts.findFirst({
          where: {
            id,
            company_id: companyId,
          },
          include: {
            items: true,
            vendor: true,
          },
        });
      }

      if (!receipt) {
        throw buildError("Receipt not found", 404);
      }

      if (receipt.status !== "SUBMITTED") {
        throw buildError("Only SUBMITTED receipts can be posted", 400);
      }

      const safeItems = Array.isArray(receipt.items) ? receipt.items : [];
      const safeBulkLines = Array.isArray(receipt.bulk_lines) ? receipt.bulk_lines : [];

      console.log("postReceipt:start", {
        receipt_id: receipt.id,
        company_id: companyId,
        warehouse_id: receipt.warehouse_id,
        items_count: safeItems.length,
        bulk_lines_count: safeBulkLines.length,
      });

      if (!safeItems.length && !safeBulkLines.length) {
        throw buildError("Receipt has no items", 400);
      }

      if (safeItems.length) {
        const internalSerials = safeItems
          .map((x) => x.internal_serial)
          .filter(Boolean);

        const manufacturerSerials = safeItems
          .map((x) => x.manufacturer_serial)
          .filter(Boolean);

        const existing = await tx.part_items.findFirst({
          where: {
            company_id: companyId,
            OR: [
              internalSerials.length
                ? { internal_serial: { in: internalSerials } }
                : undefined,
              manufacturerSerials.length
                ? { manufacturer_serial: { in: manufacturerSerials } }
                : undefined,
            ].filter(Boolean),
          },
          select: { internal_serial: true, manufacturer_serial: true },
        });

        if (existing) {
          throw buildError(
            `Serial already exists: ${existing.internal_serial || existing.manufacturer_serial}`,
            409
          );
        }

        console.log("postReceipt:createMany part_items", {
          count: safeItems.length,
        });

        await tx.part_items.createMany({
          data: safeItems.map((it) => ({
            company_id: companyId,
            part_id: it.part_id,
            warehouse_id: receipt.warehouse_id,
            internal_serial: it.internal_serial,
            manufacturer_serial: it.manufacturer_serial || null,
            status: "IN_STOCK",
            received_receipt_id: receipt.id,
            received_at: new Date(),
            last_moved_at: new Date(),
          })),
        });
      }

      let bulkTotal = 0;

      if (safeBulkLines.length) {
        const agg = new Map();

        for (const bl of safeBulkLines) {
          const pid = String(bl.part_id);
          const qty = Number(bl.qty || 0);
          if (!Number.isFinite(qty) || qty <= 0) continue;

          const tc = bl.total_cost == null ? null : Number(bl.total_cost);
          const lineTotal = Number.isFinite(tc) ? tc : 0;

          const prev = agg.get(pid) || { qty: 0, total: 0 };
          agg.set(pid, { qty: prev.qty + qty, total: prev.total + lineTotal });
        }

        for (const [part_id, obj] of agg.entries()) {
          bulkTotal += Number(obj.total || 0);

          try {
            console.log("postReceipt:warehouse_parts.upsert", {
              warehouse_id: receipt.warehouse_id,
              part_id,
              qty_increment: obj.qty,
            });

            await tx.warehouse_parts.upsert({
              where: {
                warehouse_id_part_id: {
                  warehouse_id: receipt.warehouse_id,
                  part_id,
                },
              },
              create: {
                company_id: companyId,
                warehouse_id: receipt.warehouse_id,
                part_id,
                qty_on_hand: obj.qty,
              },
              update: {
                qty_on_hand: { increment: obj.qty },
              },
            });
          } catch (e) {
            console.error("warehouse_parts upsert error:", {
              message: e?.message,
              code: e?.code,
              meta: e?.meta,
              stack: e?.stack,
            });
            throw e;
          }
        }
      }

      const serialTotal = safeItems.reduce((sum, it) => {
        const n = it.unit_cost == null ? 0 : Number(it.unit_cost);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);

      const total = toMoney(serialTotal + bulkTotal) || 0;

      console.log("postReceipt:update receipt", {
        receipt_id: receipt.id,
        total,
      });

      const posted = await tx.inventory_receipts.update({
        where: { id: receipt.id },
        data: {
          status: "POSTED",
          posted_at: new Date(),
          approved_at: new Date(),
          approved_by: userId,
          total_amount: receipt.total_amount == null ? total : receipt.total_amount,
        },
      });

      console.log("postReceipt:create cash_expense", {
        receipt_id: receipt.id,
        total,
        vendor_id: receipt.vendor_id || null,
      });

      const cashExpense = await tx.cash_expenses.create({
  data: {
    company_id: companyId,
    payment_source: "COMPANY",
    module_source: "INVENTORY",
    expense_type: "PARTS_PURCHASE",
    amount: total,
    vendor_id: receipt.vendor_id || null,
    invoice_no: receipt.invoice_no,
    invoice_date: receipt.invoice_date,
    invoice_total: total,
    created_by: userId,
    inventory_receipt_id: receipt.id,
    approval_status: "PENDING",
    notes: receipt.vendor?.name
      ? `Inventory receipt posted for vendor: ${receipt.vendor.name}`
      : "Inventory receipt posted",
  },
});
      return { posted, cashExpense };
    });

    return res.json({
      message: "Receipt posted",
      receipt: result.posted,
      cash_expense: result.cashExpense,
    });
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: String(err.message || "Error") });
    }

    if (String(err?.code) === "P2002") {
      return res
        .status(409)
        .json({ message: "Unique constraint failed (serial duplicate)" });
    }

    console.error("postReceipt error:", err);
    console.error("postReceipt details:", {
      code: err?.code,
      message: err?.message,
      meta: err?.meta,
      stack: err?.stack,
    });

    return res.status(500).json({
      message: err?.message || "Failed to post receipt",
    });
  }
}

async function cancelReceipt(req, res) {
  try {
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ACCOUNTANT/ADMIN can cancel receipts",
      });
    }

    const companyId = req.companyId;
    const id = String(req.params.id || "").trim();

    if (!companyId || !isUuid(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const receipt = await tx.inventory_receipts.findFirst({
        where: {
          id,
          company_id: companyId,
        },
      });

      if (!receipt) {
        throw buildError("Receipt not found", 404);
      }

      const st = String(receipt.status || "").toUpperCase();

      if (st === "POSTED") {
        throw buildError("Posted receipts cannot be cancelled", 400);
      }

      if (st === "CANCELLED") {
        return receipt;
      }

      return tx.inventory_receipts.update({
        where: { id: receipt.id },
        data: {
          status: "CANCELLED",
        },
      });
    });

    return res.json({
      message: "Receipt cancelled",
      receipt: updated,
    });
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: String(err.message || "Error") });
    }

    console.error("cancelReceipt error:", err);
    return res.status(500).json({ message: "Failed to cancel receipt" });
  }
}

module.exports = {
  listReceipts,
  getReceipt,
  createReceipt,
  submitReceipt,
  postReceipt,
  cancelReceipt,
};