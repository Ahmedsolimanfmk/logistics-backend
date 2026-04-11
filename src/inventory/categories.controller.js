const prisma = require("../maintenance/prisma");

function parsePagination(query) {
  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const pageSize = Math.max(parseInt(query.page_size || query.pageSize || "20", 10), 1);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeCode(v) {
  const s = String(v || "").trim();
  return s || null;
}

function requireCompanyId(companyId, res) {
  if (
    typeof companyId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)
  ) {
    res.status(400).json({ message: "Invalid company context" });
    return false;
  }
  return true;
}

async function listCategories(req, res) {
  try {
    const companyId = req.companyId;
    if (!requireCompanyId(companyId, res)) return;

    const q = normalizeText(req.query.q);
    const isActiveParam = req.query.is_active;
    const { page, pageSize, skip } = parsePagination(req.query);

    const where = {
      company_id: companyId,
      ...(typeof isActiveParam !== "undefined" && isActiveParam !== ""
        ? { is_active: String(isActiveParam).toLowerCase() === "true" }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.part_categories.findMany({
        where,
        include: {
          _count: {
            select: {
              parts: true,
            },
          },
        },
        orderBy: [{ name: "asc" }],
        skip,
        take: pageSize,
      }),
      prisma.part_categories.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      name: row.name,
      code: row.code,
      is_active: row.is_active,
      parts_count: row._count?.parts || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return res.json({
      data,
      page,
      page_size: pageSize,
      total,
    });
  } catch (error) {
    console.error("listCategories error:", error);
    return res.status(500).json({
      message: "Failed to load categories",
      error: error.message,
    });
  }
}

async function getCategory(req, res) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    if (!requireCompanyId(companyId, res)) return;

    const row = await prisma.part_categories.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      include: {
        _count: {
          select: {
            parts: true,
          },
        },
      },
    });

    if (!row) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.json({
      id: row.id,
      company_id: row.company_id,
      name: row.name,
      code: row.code,
      is_active: row.is_active,
      parts_count: row._count?.parts || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (error) {
    console.error("getCategory error:", error);
    return res.status(500).json({
      message: "Failed to load category",
      error: error.message,
    });
  }
}

async function createCategory(req, res) {
  try {
    const companyId = req.companyId;
    if (!requireCompanyId(companyId, res)) return;

    const name = normalizeText(req.body?.name);
    const code = normalizeCode(req.body?.code);

    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const existingByName = await prisma.part_categories.findFirst({
      where: {
        company_id: companyId,
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existingByName) {
      return res.status(409).json({
        message: "Category name already exists",
      });
    }

    if (code) {
      const existingByCode = await prisma.part_categories.findFirst({
        where: {
          company_id: companyId,
          code: {
            equals: code,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (existingByCode) {
        return res.status(409).json({
          message: "Category code already exists",
        });
      }
    }

    const created = await prisma.part_categories.create({
      data: {
        company_id: companyId,
        name,
        code,
        is_active: true,
      },
    });

    return res.status(201).json(created);
  } catch (error) {
    console.error("createCategory error:", error);
    return res.status(500).json({
      message: "Failed to create category",
      error: error.message,
    });
  }
}

async function updateCategory(req, res) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    if (!requireCompanyId(companyId, res)) return;

    const existing = await prisma.part_categories.findFirst({
      where: { id, company_id: companyId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Category not found" });
    }

    const name =
      typeof req.body?.name === "string" ? normalizeText(req.body.name) : undefined;
    const code =
      typeof req.body?.code === "string" ? normalizeCode(req.body.code) : undefined;
    const is_active =
      typeof req.body?.is_active === "boolean" ? req.body.is_active : undefined;

    if (typeof name !== "undefined" && !name) {
      return res.status(400).json({ message: "name cannot be empty" });
    }

    if (typeof name !== "undefined") {
      const duplicateName = await prisma.part_categories.findFirst({
        where: {
          company_id: companyId,
          id: { not: id },
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (duplicateName) {
        return res.status(409).json({
          message: "Category name already exists",
        });
      }
    }

    if (typeof code !== "undefined" && code) {
      const duplicateCode = await prisma.part_categories.findFirst({
        where: {
          company_id: companyId,
          id: { not: id },
          code: {
            equals: code,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (duplicateCode) {
        return res.status(409).json({
          message: "Category code already exists",
        });
      }
    }

    const updated = await prisma.part_categories.update({
      where: { id },
      data: {
        ...(typeof name !== "undefined" ? { name } : {}),
        ...(typeof code !== "undefined" ? { code } : {}),
        ...(typeof is_active !== "undefined" ? { is_active } : {}),
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error("updateCategory error:", error);
    return res.status(500).json({
      message: "Failed to update category",
      error: error.message,
    });
  }
}

async function deleteCategory(req, res) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    if (!requireCompanyId(companyId, res)) return;

    const existing = await prisma.part_categories.findFirst({
      where: { id, company_id: companyId },
      include: {
        _count: {
          select: {
            parts: true,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Category not found" });
    }

    if ((existing._count?.parts || 0) > 0) {
      return res.status(409).json({
        message: "Cannot delete category because it is linked to parts",
      });
    }

    await prisma.part_categories.delete({
      where: { id },
    });

    return res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("deleteCategory error:", error);
    return res.status(500).json({
      message: "Failed to delete category",
      error: error.message,
    });
  }
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};