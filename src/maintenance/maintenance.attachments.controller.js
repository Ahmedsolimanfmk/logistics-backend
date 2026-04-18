const fs = require("fs");
const path = require("path");
const multer = require("multer");
const prisma = require("../prisma");

const {
  getAuthUserId,
  getCompanyIdOrThrow,
} = require("../core/request-context");
const { assertUuid } = require("../core/validation");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeBaseName(fileName) {
  return String(fileName || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 180);
}

function buildDiskPath({ companyId, requestId }) {
  return path.join(
    process.cwd(),
    "uploads",
    "maintenance",
    String(companyId),
    String(requestId)
  );
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const companyId = req?.companyId || "unknown-company";
      const requestId = req?.params?.id || "unknown-request";
      const dir = buildDiskPath({ companyId, requestId });
      ensureDir(dir);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || "");
    const base = path.basename(file.originalname || "file", ext);
    cb(null, `${safeBaseName(base)}-${unique}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(String(file.mimetype || "").toLowerCase())) {
    const err = new Error("Unsupported file type");
    err.statusCode = 400;
    return cb(err);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
});

function normalizeAttachmentType(value, mimeType) {
  const raw = String(value || "").trim().toUpperCase();

  const allowed = new Set(["IMAGE", "DOCUMENT", "INVOICE", "OTHER"]);
  if (allowed.has(raw)) return raw;

  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime === "application/pdf") return "DOCUMENT";
  return "OTHER";
}

async function assertRequestAccessible(req, requestId) {
  const userId = getAuthUserId(req);
  const companyId = getCompanyIdOrThrow(req);

  if (!userId) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }

  const row = await prisma.maintenance_requests.findFirst({
    where: {
      id: requestId,
      company_id: companyId,
    },
    select: {
      id: true,
      vehicle_id: true,
      requested_by: true,
    },
  });

  if (!row) {
    const err = new Error("Maintenance request not found");
    err.statusCode = 404;
    throw err;
  }

  return row;
}

// GET /maintenance/requests/:id/attachments
async function listRequestAttachments(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const requestId = String(req.params.id || "");
    assertUuid(requestId, "request id");

    await assertRequestAccessible(req, requestId);

    const items = await prisma.maintenance_request_attachments.findMany({
      where: {
        company_id: companyId,
        request_id: requestId,
      },
      orderBy: {
        created_at: "desc",
      },
      select: {
        id: true,
        company_id: true,
        request_id: true,
        type: true,
        original_name: true,
        mime_type: true,
        size_bytes: true,
        storage_path: true,
        uploaded_by: true,
        created_at: true,
      },
    });

    return res.json({ items });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("LIST REQUEST ATTACHMENTS ERROR:", e);
    return res.status(500).json({
      message: "Failed to list attachments",
      error: e.message,
    });
  }
}

// POST /maintenance/requests/:id/attachments
async function createRequestAttachments(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const requestId = String(req.params.id || "");
    assertUuid(requestId, "request id");

    await assertRequestAccessible(req, requestId);

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const bodyTypes = Array.isArray(req.body?.types)
      ? req.body.types
      : req.body?.types
      ? [req.body.types]
      : [];

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const inputType = bodyTypes[i] ?? req.body?.type ?? null;
        const attachmentType = normalizeAttachmentType(inputType, file.mimetype);

        const row = await tx.maintenance_request_attachments.create({
          data: {
            company_id: companyId,
            request_id: requestId,
            type: attachmentType,
            original_name: String(file.originalname || "").trim() || file.filename,
            mime_type: String(file.mimetype || "").trim(),
            size_bytes: Number(file.size || 0),
            storage_path: String(file.path || "").trim(),
            uploaded_by: userId,
          },
          select: {
            id: true,
            company_id: true,
            request_id: true,
            type: true,
            original_name: true,
            mime_type: true,
            size_bytes: true,
            storage_path: true,
            uploaded_by: true,
            created_at: true,
          },
        });

        rows.push(row);
      }

      return rows;
    });

    return res.status(201).json({
      message: "Attachments uploaded",
      items: created,
    });
  } catch (e) {
    const files = Array.isArray(req.files) ? req.files : [];
    for (const f of files) {
      try {
        if (f?.path && fs.existsSync(f.path)) {
          fs.unlinkSync(f.path);
        }
      } catch (_) {}
    }

    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("CREATE REQUEST ATTACHMENTS ERROR:", e);
    return res.status(500).json({
      message: "Failed to upload attachments",
      error: e.message,
    });
  }
}

// DELETE /maintenance/attachments/:attachmentId
async function deleteAttachment(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const attachmentId = String(req.params.attachmentId || "");
    assertUuid(attachmentId, "attachment id");

    const row = await prisma.maintenance_request_attachments.findFirst({
      where: {
        id: attachmentId,
        company_id: companyId,
      },
      select: {
        id: true,
        storage_path: true,
      },
    });

    if (!row) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    await prisma.maintenance_request_attachments.deleteMany({
      where: {
        id: attachmentId,
        company_id: companyId,
      },
    });

    try {
      if (row.storage_path && fs.existsSync(row.storage_path)) {
        fs.unlinkSync(row.storage_path);
      }
    } catch (fsErr) {
      console.warn("DELETE ATTACHMENT FILE WARNING:", fsErr?.message || fsErr);
    }

    return res.json({
      message: "Attachment deleted",
    });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("DELETE ATTACHMENT ERROR:", e);
    return res.status(500).json({
      message: "Failed to delete attachment",
      error: e.message,
    });
  }
}

const uploadRequestAttachments = [
  upload.array("files", 5),
  createRequestAttachments,
];

module.exports = {
  uploadRequestAttachments,
  listRequestAttachments,
  deleteAttachment,
};