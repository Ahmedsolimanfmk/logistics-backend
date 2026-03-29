const prisma = require("../maintenance/prisma");
const { getUserId, getUserRole } = require("../auth/access");

function isUuid(v) {
  return typeof v === "string" && v.length === 36;
}

// =======================
// LIST
// =======================
async function listIssues(req, res) {
  try {
    const companyId = req.companyId;

    const where = {
      company_id: companyId,
    };

    const rows = await prisma.inventory_issues.findMany({
      where,
      orderBy: [{ created_at: "desc" }],
      include: {
        warehouses: true,
        requests: true,
        inventory_issue_lines: {
          include: { parts: true, part_items: true },
        },
      },
    });

    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to list issues" });
  }
}

// =======================
// GET ONE
// =======================
async function getIssue(req, res) {
  try {
    const companyId = req.companyId;
    const id = req.params.id;

    const row = await prisma.inventory_issues.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      include: {
        warehouses: true,
        requests: true,
        inventory_issue_lines: {
          include: { parts: true, part_items: true },
        },
      },
    });

    if (!row) return res.status(404).json({ message: "Issue not found" });

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed" });
  }
}