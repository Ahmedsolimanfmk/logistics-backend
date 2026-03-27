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

// -----------------------
// Controllers
// -----------------------
async function listReceipts(req, res) {
  try {
    const status = String(req.query.status || "").trim();
    const warehouse_id = String(req.query.warehouse_id || "").trim();

    if (warehouse_id && !isUuid(warehouse_id)) {
      return res.status(400).json({ message: "warehouse_id is invalid" });
    }

    const where = {};
    if (status) where.status = status;
    if (warehouse_id) where.warehouse_id = warehouse_id;

    let rows;
    try {
      rows = await prisma.inventory_receipts.findMany({
        where: Object.keys(where).length ? where : undefined,
        orderBy: [{ created_at: "desc" }],
        include: {
          warehouses: true,
          vendors: true,
          items: {
            include: {
              parts: true,
            },
          },
          bulk_lines: {
            include: {
              parts: true,
            },
          },
        },
      });
    } catch (e) {
      if (
        !isPrismaMissingAnyBulkModel(e) &&
        !isPrismaModelMissingByName(e, "bulk_lines")
      ) {
        throw e;
      }

      rows = await prisma.inventory_receipts.findMany({
        where: Object.keys(where).length ? where : undefined,
        orderBy: [{ created_at: "desc" }],
        include: {
          warehouses: true,
          vendors: true,
          items: {
            include: {
              parts: true,
            },
          },
        },
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
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    let row;
    try {
      row = await prisma.inventory_receipts.findUnique({
        where: { id },
        include: {
          warehouses: true,
          vendors: true,
          items: { include: { parts: true } },
          bulk_lines: { include: { parts: true } },
          cash_expenses: true,
        },
      });
    } catch (e) {
      if (
        !isPrismaMissingAnyBulkModel(e) &&
        !isPrismaModelMissingByName(e, "bulk_lines")
      ) {
        throw e;
      }

      row = await prisma.inventory_receipts.findUnique({
        where: { id },
        include: {
          warehouses: true,
          vendors: true,
          items: { include: { parts: true } },
          cash_expenses: true,
        },
      });
    }

    if (!row) return res.status(404).json({ message: "Receipt not found" });
    return res.json(row);
  } catch (err) {
    console.error("getReceipt error:", err);
    return res.status(500).json({ message: "Failed to get receipt" });
  }
}

async function createReceipt(req, res) {
  try {
    const created_by = getUserId(req);

    const warehouse_id = String(req.body?.warehouse_id || "").trim();
    const vendor_id =
      req.body?.vendor_id != null ? String(req.body.vendor_id).trim() : null;
    const invoice_no =
      req.body?.invoice_no != null ? String(req.body.invoice_no).trim() : null;

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
      const manufacturer_serial = String(it?.manufacturer_serial || "").trim();

      if (!isUuid(part_id)) {
        return res.status(400).json({ message: `items[${i}].part_id is invalid` });
      }
      if (!internal_serial) {
        return res.status(400).json({
          message: `items[${i}].internal_serial is required`,
        });
      }
      if (!manufacturer_serial) {
        return res.status(400).json({
          message: `items[${i}].manufacturer_serial is required`,
        });
      }

      const uc = toMoney(it?.unit_cost);
      if (it?.unit_cost != null && it?.unit_cost !== "" && uc == null) {
        return res
          .status(400)
          .json({ message: `items[${i}].unit_cost is invalid` });
      }
    }

    const dup1 = dedupeCheck(items.map((x) => x?.internal_serial));
    if (dup1) {
      return res
        .status(400)
        .json({ message: `Duplicate internal_serial in payload: ${dup1}` });
    }

    const dup2 = dedupeCheck(items.map((x) => x?.manufacturer_serial));
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
      created = await prisma.inventory_receipts.create({
        data: {
          warehouse_id,
          vendor_id,
          invoice_no,
          invoice_date,
          status: "DRAFT",
          created_by: created_by || null,
          items: {
            create: items.map((it) => ({
              part_id: String(it.part_id).trim(),
              internal_serial: String(it.internal_serial).trim(),
              manufacturer_serial: String(it.manufacturer_serial).trim(),
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
                part_id: String(bl.part_id).trim(),
                qty,
                unit_cost,
                total_cost,
                notes: bl?.notes != null ? String(bl.notes).trim() : null,
              };
            }),
          },
        },
        include: {
          warehouses: true,
          vendors: true,
          items: { include: { parts: true } },
          bulk_lines: { include: { parts: true } },
        },
      });
    } catch (e) {
      if (
        !isPrismaMissingAnyBulkModel(e) &&
        !isPrismaModelMissingByName(e, "bulk_lines")
      ) {
        throw e;
      }

      created = await prisma.inventory_receipts.create({
        data: {
          warehouse_id,
          vendor_id,
          invoice_no,
          invoice_date,
          status: "DRAFT",
          created_by: created_by || null,
          items: {
            create: items.map((it) => ({
              part_id: String(it.part_id).trim(),
              internal_serial: String(it.internal_serial).trim(),
              manufacturer_serial: String(it.manufacturer_serial).trim(),
              unit_cost: toMoney(it.unit_cost),
              notes: it?.notes != null ? String(it.notes).trim() : null,
            })),
          },
        },
        include: {
          warehouses: true,
          vendors: true,
          items: { include: { parts: true } },
        },
      });

      if (bulk_lines.length) {
        return res.status(400).json({
          message:
            "bulk_lines provided but Prisma schema/models for bulk are not available. Apply migration for warehouse_parts & inventory_receipt_bulk_lines first.",
        });
      }
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
    if (!isAdminOrStorekeeper(req)) {
      return res.status(403).json({
        message: "Only STOREKEEPER/ADMIN can submit receipts",
      });
    }

    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const userId = getUserId(req);

    const updated = await prisma.$transaction(async (tx) => {
      let receipt;

      try {
        receipt = await tx.inventory_receipts.findUnique({
          where: { id },
          include: { items: true, bulk_lines: true },
        });
      } catch (e) {
        if (
          !isPrismaMissingAnyBulkModel(e) &&
          !isPrismaModelMissingByName(e, "bulk_lines")
        ) {
          throw e;
        }

        receipt = await tx.inventory_receipts.findUnique({
          where: { id },
          include: { items: true },
        });
      }

      if (!receipt) {
        const e = new Error("Receipt not found");
        e.statusCode = 404;
        throw e;
      }

      if (receipt.status !== "DRAFT") {
        const e = new Error("Only DRAFT receipts can be submitted");
        e.statusCode = 400;
        throw e;
      }

      const safeBulkLines = Array.isArray(receipt.bulk_lines)
        ? receipt.bulk_lines
        : [];

      const hasSerialItems = Array.isArray(receipt.items) && receipt.items.length > 0;
      const hasBulkLines = safeBulkLines.length > 0;

      if (!hasSerialItems && !hasBulkLines) {
        const e = new Error("Receipt has no items");
        e.statusCode = 400;
        throw e;
      }

      return tx.inventory_receipts.update({
        where: { id },
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

    const userId = getUserId(req);

    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const result = await prisma.$transaction(async (tx) => {
      let receipt;

      try {
        receipt = await tx.inventory_receipts.findUnique({
          where: { id },
          include: {
            items: true,
            bulk_lines: true,
            vendors: true,
          },
        });
      } catch (e) {
        if (
          !isPrismaMissingAnyBulkModel(e) &&
          !isPrismaModelMissingByName(e, "bulk_lines")
        ) {
          throw e;
        }

        receipt = await tx.inventory_receipts.findUnique({
          where: { id },
          include: {
            items: true,
            vendors: true,
          },
        });
      }

      if (!receipt) {
        const e = new Error("Receipt not found");
        e.statusCode = 404;
        throw e;
      }

      if (receipt.status !== "SUBMITTED") {
        const e = new Error("Only SUBMITTED receipts can be posted");
        e.statusCode = 400;
        throw e;
      }

      const safeItems = Array.isArray(receipt.items) ? receipt.items : [];
      const safeBulkLines = Array.isArray(receipt.bulk_lines)
        ? receipt.bulk_lines
        : [];

      const hasSerialItems = safeItems.length > 0;
      const hasBulkLines = safeBulkLines.length > 0;

      if (!hasSerialItems && !hasBulkLines) {
        const e = new Error("Receipt has no items");
        e.statusCode = 400;
        throw e;
      }

      if (hasSerialItems) {
        const internalSerials = safeItems.map((x) => x.internal_serial);
        const manufacturerSerials = safeItems.map((x) => x.manufacturer_serial);

        const existing = await tx.part_items.findFirst({
          where: {
            OR: [
              { internal_serial: { in: internalSerials } },
              { manufacturer_serial: { in: manufacturerSerials } },
            ],
          },
          select: { internal_serial: true, manufacturer_serial: true },
        });

        if (existing) {
          const e = new Error(
            `Serial already exists: ${existing.internal_serial || existing.manufacturer_serial}`
          );
          e.statusCode = 409;
          throw e;
        }

        await tx.part_items.createMany({
          data: safeItems.map((it) => ({
            part_id: it.part_id,
            warehouse_id: receipt.warehouse_id,
            internal_serial: it.internal_serial,
            manufacturer_serial: it.manufacturer_serial,
            status: "IN_STOCK",
            received_receipt_id: receipt.id,
            received_at: new Date(),
            last_moved_at: new Date(),
          })),
        });
      }

      let bulkTotal = 0;

      if (hasBulkLines) {
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
            await tx.warehouse_parts.upsert({
              where: {
                uq_warehouse_parts_warehouse_part: {
                  warehouse_id: receipt.warehouse_id,
                  part_id,
                },
              },
              create: {
                warehouse_id: receipt.warehouse_id,
                part_id,
                qty_on_hand: obj.qty,
              },
              update: {
                qty_on_hand: { increment: obj.qty },
              },
            });
          } catch (e) {
            if (isPrismaMissingAnyBulkModel(e)) {
              const er = new Error(
                "Bulk posting requires Prisma migration for warehouse_parts & inventory_receipt_bulk_lines."
              );
              er.statusCode = 400;
              throw er;
            }
            throw e;
          }
        }
      }

      const serialTotal = hasSerialItems
        ? safeItems.reduce((sum, it) => {
            const n = it.unit_cost == null ? 0 : Number(it.unit_cost);
            return sum + (Number.isFinite(n) ? n : 0);
          }, 0)
        : 0;

      const total = toMoney(serialTotal + bulkTotal) || 0;

      const posted = await tx.inventory_receipts.update({
        where: { id: receipt.id },
        data: {
          status: "POSTED",
          posted_at: new Date(),
          total_amount: receipt.total_amount == null ? total : receipt.total_amount,
        },
      });

      const cashExpense = await tx.cash_expenses.create({
        data: {
          payment_source: "COMPANY",
          expense_type: "SPARE_PARTS_PURCHASE",
          amount: total,
          vendor_id: receipt.vendor_id || null,
          invoice_no: receipt.invoice_no,
          invoice_date: receipt.invoice_date,
          invoice_total: total,
          created_by: userId,
          inventory_receipt_id: receipt.id,
          approval_status: "PENDING",
          notes: receipt.vendors?.name
            ? `Inventory receipt posted for vendor: ${receipt.vendors.name}`
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
    return res.status(500).json({ message: "Failed to post receipt" });
  }
}

module.exports = {
  listReceipts,
  getReceipt,
  createReceipt,
  submitReceipt,
  postReceipt,
};