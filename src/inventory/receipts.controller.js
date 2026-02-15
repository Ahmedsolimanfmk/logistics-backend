// =======================
// src/inventory/receipts.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

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
  // keep 2 decimals
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

async function listReceipts(req, res) {
  try {
    const status = String(req.query.status || "").trim(); // DRAFT/POSTED/CANCELLED
    const warehouse_id = String(req.query.warehouse_id || "").trim();

    const where = {};
    if (status) where.status = status;
    if (warehouse_id) where.warehouse_id = warehouse_id;

    const rows = await prisma.inventory_receipts.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ created_at: "desc" }],
      include: {
        warehouses: true,
        items: true,
      },
    });

    res.json({ items: rows });
  } catch (err) {
    console.error("listReceipts error:", err);
    res.status(500).json({ message: "Failed to list receipts" });
  }
}

async function getReceipt(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const row = await prisma.inventory_receipts.findUnique({
      where: { id },
      include: {
        warehouses: true,
        items: { include: { parts: true } },
        cash_expenses: true,
      },
    });

    if (!row) return res.status(404).json({ message: "Receipt not found" });
    res.json(row);
  } catch (err) {
    console.error("getReceipt error:", err);
    res.status(500).json({ message: "Failed to get receipt" });
  }
}

/**
 * Body example:
 * {
 *   "warehouse_id": "...",
 *   "supplier_name": "ABC",
 *   "invoice_no": "123",
 *   "invoice_date": "2026-02-15",
 *   "items": [
 *     { "part_id":"...", "internal_serial":"INT-0001", "manufacturer_serial":"MFG-999", "unit_cost": 1200 }
 *   ]
 * }
 */
async function createReceipt(req, res) {
  try {
    const created_by = getAuthUserId(req);

    const warehouse_id = String(req.body?.warehouse_id || "").trim();
    const supplier_name = String(req.body?.supplier_name || "").trim();
    const invoice_no = req.body?.invoice_no != null ? String(req.body.invoice_no).trim() : null;

    const invoice_date =
      req.body?.invoice_date != null && String(req.body.invoice_date).trim()
        ? new Date(String(req.body.invoice_date).trim())
        : null;

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!isUuid(warehouse_id)) return res.status(400).json({ message: "warehouse_id is required" });
    if (!supplier_name) return res.status(400).json({ message: "supplier_name is required" });
    if (invoice_date && Number.isNaN(invoice_date.getTime())) {
      return res.status(400).json({ message: "invoice_date is invalid" });
    }

    // validate items (serial-first)
    for (const [i, it] of items.entries()) {
      const part_id = String(it?.part_id || "").trim();
      const internal_serial = String(it?.internal_serial || "").trim();
      const manufacturer_serial = String(it?.manufacturer_serial || "").trim();

      if (!isUuid(part_id)) return res.status(400).json({ message: `items[${i}].part_id is invalid` });
      if (!internal_serial) return res.status(400).json({ message: `items[${i}].internal_serial is required` });
      if (!manufacturer_serial) return res.status(400).json({ message: `items[${i}].manufacturer_serial is required` });

      const uc = toMoney(it?.unit_cost);
      if (it?.unit_cost != null && it?.unit_cost !== "" && uc == null) {
        return res.status(400).json({ message: `items[${i}].unit_cost is invalid` });
      }
    }

    // check duplicates inside payload
    const dup1 = dedupeCheck(items.map((x) => x?.internal_serial));
    if (dup1) return res.status(400).json({ message: `Duplicate internal_serial in payload: ${dup1}` });

    const dup2 = dedupeCheck(items.map((x) => x?.manufacturer_serial));
    if (dup2) return res.status(400).json({ message: `Duplicate manufacturer_serial in payload: ${dup2}` });

    const created = await prisma.inventory_receipts.create({
      data: {
        warehouse_id,
        supplier_name,
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
      include: { items: true },
    });

    res.status(201).json(created);
  } catch (err) {
    // unique constraints from schema (serials etc)
    if (String(err?.code) === "P2002") {
      return res.status(409).json({ message: "Unique constraint failed (possibly invoice/serial duplication)" });
    }
    console.error("createReceipt error:", err);
    res.status(500).json({ message: "Failed to create receipt" });
  }
}

async function postReceipt(req, res) {
  try {
    const userId = getAuthUserId(req);

    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.inventory_receipts.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!receipt) {
        const e = new Error("Receipt not found");
        e.statusCode = 404;
        throw e;
      }
      if (receipt.status !== "DRAFT") {
        const e = new Error("Only DRAFT receipts can be posted");
        e.statusCode = 400;
        throw e;
      }
      if (!receipt.items || receipt.items.length === 0) {
        const e = new Error("Receipt has no items");
        e.statusCode = 400;
        throw e;
      }

      // Ensure serials not already exist in part_items
      const internalSerials = receipt.items.map((x) => x.internal_serial);
      const manufacturerSerials = receipt.items.map((x) => x.manufacturer_serial);

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

      // create serial units as part_items
      await tx.part_items.createMany({
        data: receipt.items.map((it) => ({
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

      // compute total
      const total = receipt.items.reduce((sum, it) => {
        const n = it.unit_cost == null ? 0 : Number(it.unit_cost);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);

      // update receipt to POSTED
      const posted = await tx.inventory_receipts.update({
        where: { id: receipt.id },
        data: {
          status: "POSTED",
          posted_at: new Date(),
          total_amount: receipt.total_amount == null ? total : receipt.total_amount,
        },
      });

      // create cash expense automatically (COMPANY)
      const cashExpense = await tx.cash_expenses.create({
        data: {
          payment_source: "COMPANY",
          expense_type: "SPARE_PARTS_PURCHASE",
          amount: total,
          vendor_name: receipt.supplier_name,
          invoice_no: receipt.invoice_no,
          invoice_date: receipt.invoice_date,
          invoice_total: total,
          created_by: userId, // required in your schema
          inventory_receipt_id: receipt.id,
          approval_status: "PENDING",
        },
      });

      return { posted, cashExpense };
    });

    res.json({
      message: "Receipt posted",
      receipt: result.posted,
      cash_expense: result.cashExpense,
    });
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: String(err.message || "Error") });

    if (String(err?.code) === "P2002") {
      return res.status(409).json({ message: "Unique constraint failed (serial duplicate)" });
    }
    console.error("postReceipt error:", err);
    res.status(500).json({ message: "Failed to post receipt" });
  }
}

module.exports = {
  listReceipts,
  getReceipt,
  createReceipt,
  postReceipt,
};
