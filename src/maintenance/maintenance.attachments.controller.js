const path = require("path");
const fs = require("fs");
const multer = require("multer");
const prisma = require("../prisma");

function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}
function roleUpper(r) {
  return String(r || "").toUpperCase();
}
function isAdminOrAccountant(role) {
  const rr = roleUpper(role);
  return rr === "ADMIN" || rr === "ACCOUNTANT";
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function detectType(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return "IMAGE";
  if (m.startsWith("video/")) return "VIDEO";
  return "OTHER";
}

// uploads/maintenance/requests/<requestId>/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const requestId = String(req.params.id || "");
    const dir = path.join(process.cwd(), "uploads", "maintenance", "requests", requestId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safeBase = String(file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\-\.]/g, "")
      .slice(0, 80);
    const stamp = Date.now();
    cb(null, `${stamp}_${safeBase || "file"}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 8 },
});

// FIELD_SUPERVISOR: يقدر يشوف/يرفع فقط لبلاغاته. ADMIN/ACCOUNTANT: الكل.
async function assertCanAccessRequest(req, requestId) {
  const userId = getAuthUserId(req);
  if (!userId) return { ok: false, status: 401, message: "Unauthorized" };

  const role = req.user?.role || null;

  const row = await prisma.maintenance_requests.findUnique({
    where: { id: requestId },
    select: { id: true, requested_by: true },
  });
  if (!row) return { ok: false, status: 404, message: "Request not found" };

  if (isAdminOrAccountant(role)) return { ok: true, row };

  if (row.requested_by !== userId) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true, row };
}

// POST /maintenance/requests/:id/attachments  (multipart/form-data) field name: files
const uploadRequestAttachments = [
  upload.array("files", 8),
  async (req, res) => {
    try {
      const requestId = String(req.params.id || "");
      const guard = await assertCanAccessRequest(req, requestId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

      const userId = getAuthUserId(req);

      const files = req.files || [];
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const created = [];
      for (const f of files) {
        const relPath = `/uploads/maintenance/requests/${requestId}/${path.basename(f.path)}`;

        const att = await prisma.maintenance_request_attachments.create({
          data: {
            request_id: requestId,
            type: detectType(f.mimetype),
            original_name: f.originalname,
            mime_type: f.mimetype,
            size_bytes: f.size,
            storage_path: relPath,
            uploaded_by: userId,
          },
        });

        created.push(att);
      }

      return res.json({ items: created });
    } catch (e) {
      console.log("UPLOAD ATTACHMENTS ERROR:", e);
      return res.status(500).json({ message: "Failed to upload attachments" });
    }
  },
];

// GET /maintenance/requests/:id/attachments
async function listRequestAttachments(req, res) {
  try {
    const requestId = String(req.params.id || "");
    const guard = await assertCanAccessRequest(req, requestId);
    if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

    const items = await prisma.maintenance_request_attachments.findMany({
      where: { request_id: requestId },
      orderBy: { created_at: "desc" },
    });

    return res.json({ items });
  } catch (e) {
    console.log("LIST ATTACHMENTS ERROR:", e);
    return res.status(500).json({ message: "Failed to load attachments" });
  }
}

// DELETE /maintenance/attachments/:attachmentId  (ADMIN/ACCOUNTANT only)
async function deleteAttachment(req, res) {
  try {
    const id = String(req.params.attachmentId || "");
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = req.user?.role || null;
    if (!isAdminOrAccountant(role)) return res.status(403).json({ message: "Forbidden" });

    const att = await prisma.maintenance_request_attachments.findUnique({ where: { id } });
    if (!att) return res.status(404).json({ message: "Attachment not found" });

    // delete file (best-effort)
    const abs = path.join(process.cwd(), att.storage_path.replace(/^\//, ""));
    try {
      fs.unlinkSync(abs);
    } catch {}

    await prisma.maintenance_request_attachments.delete({ where: { id } });
    return res.json({ message: "Deleted" });
  } catch (e) {
    console.log("DELETE ATTACHMENT ERROR:", e);
    return res.status(500).json({ message: "Failed to delete attachment" });
  }
}
module.exports = {
  uploadRequestAttachments,
  listRequestAttachments,
  deleteAttachment,
};

