// =======================
// src/users/users.routes.js (FIXED)
// =======================

const express = require("express");
const router = express.Router();

// ✅ FIX: correct relative paths (users.routes.js is inside src/users)
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdmin, requireAdminOrHR } = require("../auth/role.middleware");

// ✅ FIX: correct relative path to controller
const {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
} = require("./users.controller");

// HR + ADMIN (قراءة)
router.get("/", authRequired, requireAdminOrHR, listUsers);
router.get("/:id", authRequired, requireAdminOrHR, getUserById);

// ADMIN فقط (كتابة)
router.post("/", authRequired, requireAdmin, createUser);
router.patch("/:id", authRequired, requireAdmin, updateUser);
router.patch("/:id/status", authRequired, requireAdmin, setUserStatus);
router.post("/:id/reset-password", authRequired, requireAdmin, resetUserPassword);

module.exports = router;
