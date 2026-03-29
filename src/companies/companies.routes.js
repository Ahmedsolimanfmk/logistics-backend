const express = require("express");
const router = express.Router();

const { authRequired } = require("../auth/jwt.middleware");
const { requireAdmin, requireAdminOrHR } = require("../auth/role.middleware");
const { requireCompany } = require("../auth/company.middleware");
const {
  requireCompanyActive,
  requireCompanyFeature,
} = require("./company-access.middleware");

const controller = require("./companies.controller");

router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);

// company profile
router.get("/me", requireAdminOrHR, controller.getCurrentCompany);
router.patch("/me", requireAdmin, controller.updateCurrentCompany);

// members
router.get(
  "/me/members",
  requireAdminOrHR,
  requireCompanyFeature("company.memberships.access"),
  controller.listMembers
);

router.get(
  "/me/members/:userId",
  requireAdminOrHR,
  requireCompanyFeature("company.memberships.access"),
  controller.getMemberByUserId
);

router.patch(
  "/me/members/:userId",
  requireAdmin,
  requireCompanyFeature("company.memberships.access"),
  controller.updateMember
);

// subscription
router.get(
  "/me/subscription",
  requireAdminOrHR,
  requireCompanyFeature("company.subscription.access"),
  controller.getCurrentSubscription
);

router.post(
  "/me/subscription",
  requireAdmin,
  requireCompanyFeature("company.subscription.access"),
  controller.createSubscription
);

// settings
router.get(
  "/me/settings",
  requireAdminOrHR,
  requireCompanyFeature("company.settings.access"),
  controller.listSettings
);

router.put(
  "/me/settings",
  requireAdmin,
  requireCompanyFeature("company.settings.access"),
  controller.upsertSetting
);

router.delete(
  "/me/settings/:settingKey",
  requireAdmin,
  requireCompanyFeature("company.settings.access"),
  controller.deleteSetting
);

module.exports = router;