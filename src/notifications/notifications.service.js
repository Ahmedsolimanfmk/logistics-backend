const prisma = require("../prisma");
const admin = require("firebase-admin");

// Initialize Firebase Admin if credentials are provided in env
try {
  if (process.env.FIREBASE_CREDENTIALS && !admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin Initialized for Push Notifications");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error.message);
}

/**
 * Service for generating and fetching system notifications
 */
class NotificationsService {
  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications({ companyId, userId, limit = 50 }) {
    return prisma.notifications.findMany({
      where: {
        company_id: companyId,
        user_id: userId,
        is_read: false,
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });
  }

  /**
   * Mark notifications as read
   */
  async markAsRead({ companyId, userId, notificationIds }) {
    return prisma.notifications.updateMany({
      where: {
        company_id: companyId,
        user_id: userId,
        id: { in: notificationIds },
      },
      data: {
        is_read: true,
      },
    });
  }

  /**
   * Create a notification (Internal use)
   */
  async createNotification({ companyId, userId, title, message, type = "INFO", entityType = null, entityId = null }) {
    const notification = await prisma.notifications.create({
      data: {
        company_id: companyId,
        user_id: userId,
        title,
        message,
        type,
        entity_type: entityType,
        entity_id: entityId,
      },
    });

    // Try sending Push Notification via FCM
    try {
      if (admin.apps.length > 0) {
        const user = await prisma.users.findUnique({
          where: { id: userId },
          select: { fcm_token: true }
        });

        if (user && user.fcm_token) {
          await admin.messaging().send({
            token: user.fcm_token,
            notification: {
              title: title,
              body: message,
            },
            data: {
              entityType: entityType || "",
              entityId: entityId || "",
              type: type || "INFO",
            }
          });
          console.log(`Push notification sent to user ${userId}`);
        }
      }
    } catch (pushError) {
      console.error("Error sending push notification:", pushError.message);
    }

    return notification;
  }

  /**
   * Check for expired licenses and generate alerts
   * Usually run via a cron job daily
   */
  async checkLicenseExpirations({ companyId }) {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const expiringVehicles = await prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        license_expiry_date: {
          lte: nextWeek,
          gte: today,
        },
        status: { not: "OUT_OF_SERVICE" },
      },
      select: { id: true, fleet_no: true, plate_no: true, license_expiry_date: true },
    });

    const admins = await prisma.users.findMany({
      where: {
        role: "ADMIN",
        is_active: true,
        memberships: { some: { company_id: companyId } }
      },
      select: { id: true }
    });

    for (const vehicle of expiringVehicles) {
      for (const admin of admins) {
        // Prevent duplicate alerts
        const existing = await prisma.notifications.findFirst({
          where: {
            company_id: companyId,
            user_id: admin.id,
            entity_id: vehicle.id,
            type: "WARNING",
            is_read: false,
          }
        });

        if (!existing) {
          await this.createNotification({
            companyId,
            userId: admin.id,
            title: "تنبيه قرب انتهاء رخصة مركبة",
            message: `رخصة المركبة ${vehicle.fleet_no} (${vehicle.plate_no}) ستنتهي بتاريخ ${vehicle.license_expiry_date?.toISOString().split('T')[0]}`,
            type: "WARNING",
            entityType: "VEHICLE",
            entityId: vehicle.id,
          });
        }
      }
    }

    return expiringVehicles.length;
  }

  /**
   * Check for low stock parts and generate alerts
   */
  async checkLowStock({ companyId }) {
    const lowStockParts = await prisma.parts.findMany({
      where: {
        company_id: companyId,
        qty_on_hand: { lte: prisma.parts.fields.min_stock_level },
        is_active: true,
      },
      select: { id: true, part_number: true, name: true, qty_on_hand: true, min_stock_level: true },
    });

    const admins = await prisma.users.findMany({
      where: {
        role: { in: ["ADMIN", "STOREKEEPER"] },
        is_active: true,
        memberships: { some: { company_id: companyId } }
      },
      select: { id: true }
    });

    for (const part of lowStockParts) {
      for (const admin of admins) {
        const existing = await prisma.notifications.findFirst({
          where: {
            company_id: companyId,
            user_id: admin.id,
            entity_id: part.id,
            type: "WARNING",
            is_read: false,
          }
        });

        if (!existing) {
          await this.createNotification({
            companyId,
            userId: admin.id,
            title: "تنبيه انخفاض مخزون",
            message: `الصنف ${part.name} (${part.part_number}) وصل للحد الأدنى (الكمية الحالية: ${part.qty_on_hand})`,
            type: "WARNING",
            entityType: "INVENTORY",
            entityId: part.id,
          });
        }
      }
    }

    return lowStockParts.length;
  }
}

module.exports = new NotificationsService();
