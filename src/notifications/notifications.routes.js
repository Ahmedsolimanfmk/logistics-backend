const express = require("express");
const router = express.Router();
const notificationsController = require("./notifications.controller");
const { authRequired } = require("../auth/jwt.middleware");

// All routes require authentication
router.use(authRequired);

// Get unread notifications
router.get("/unread", notificationsController.getUnread);

// Mark notifications as read
router.post("/mark-read", notificationsController.markAsRead);

// Run checks (usually a cron or admin endpoint)
router.post("/run-checks", notificationsController.runChecks);

module.exports = router;
