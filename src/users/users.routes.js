// =======================
// src/users/users.routes.js
// tenant-safe
// =======================

const express = require("express");
const router = express.Router();

const { authRequired } = require("../auth/jwt.middleware");
const { requireAdmin, requireAdminOrHR } = require("../auth/role.middleware");
const { requireCompany } = require("../auth/company.middleware");

const {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
} = require("./users.controller");

router.use(authRequired);
router.use(requireCompany);

// HR + ADMIN (قراءة)
router.get("/", requireAdminOrHR, listUsers);
router.get("/:id", requireAdminOrHR, getUserById);

// ADMIN فقط (كتابة)
router.post("/", requireAdmin, createUser);
router.patch("/:id", requireAdmin, updateUser);
router.patch("/:id/status", requireAdmin, setUserStatus);
router.post("/:id/reset-password", requireAdmin, resetUserPassword);

module.exports = router;