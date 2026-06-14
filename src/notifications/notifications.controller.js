const notificationsService = require("./notifications.service");

class NotificationsController {
  async getUnread(req, res) {
    try {
      const companyId = req.user.company_id;
      const userId = req.user.userId || req.user.id;
      
      const notifications = await notificationsService.getUnreadNotifications({
        companyId,
        userId,
        limit: 50,
      });

      res.json({ ok: true, data: notifications });
    } catch (error) {
      console.error("[Notifications] getUnread error:", error);
      res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  }

  async markAsRead(req, res) {
    try {
      const companyId = req.user.company_id;
      const userId = req.user.userId || req.user.id;
      const { notificationIds } = req.body;

      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ ok: false, error: "Invalid notificationIds" });
      }

      await notificationsService.markAsRead({
        companyId,
        userId,
        notificationIds,
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("[Notifications] markAsRead error:", error);
      res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  }

  // Triggered manually or by a cron job
  async runChecks(req, res) {
    try {
      const companyId = req.user.company_id;
      
      const expiredCount = await notificationsService.checkLicenseExpirations({ companyId });
      // Depending on if `parts` table exists with `qty_on_hand` and `min_stock_level`
      // For now we'll wrap checkLowStock in a try catch just in case
      let lowStockCount = 0;
      try {
         lowStockCount = await notificationsService.checkLowStock({ companyId });
      } catch (err) {
         console.warn("[Notifications] checkLowStock warning: parts model might not have min_stock_level yet.");
      }

      res.json({ 
        ok: true, 
        message: "Checks completed", 
        expired_vehicles_checked: expiredCount,
        low_stock_checked: lowStockCount
      });
    } catch (error) {
      console.error("[Notifications] runChecks error:", error);
      res.status(500).json({ ok: false, error: "Internal Server Error" });
    }
  }
}

module.exports = new NotificationsController();
