const prisma = require("../prisma");

function isSubscriptionUsable(subscription) {
  if (!subscription) return false;

  const now = new Date();

  if (subscription.status === "ACTIVE" || subscription.status === "TRIAL") {
    if (!subscription.ends_at) return true;
    return new Date(subscription.ends_at).getTime() >= now.getTime();
  }

  if (subscription.status === "SUSPENDED") {
    if (!subscription.grace_ends_at) return false;
    return new Date(subscription.grace_ends_at).getTime() >= now.getTime();
  }

  return false;
}

function normalizePlanCode(value) {
  return String(value || "").trim().toUpperCase();
}

function hasPlanFeature(subscription, featureKey) {
  const planCode = normalizePlanCode(subscription?.plan_code);

  switch (featureKey) {
    case "company.settings.access":
      return true;

    case "company.memberships.access":
      return true;

    case "company.subscription.access":
      return true;

    case "finance.access":
      return ["PRO", "BUSINESS", "ENTERPRISE"].includes(planCode);

    case "maintenance.access":
      return ["PRO", "BUSINESS", "ENTERPRISE"].includes(planCode);

    case "analytics.access":
      return Boolean(subscription?.analytics_enabled);

    case "ai.access":
      return Boolean(subscription?.ai_enabled);

    case "warehouses.access":
      return true;

    case "vehicles.access":
      return true;

    case "trips.access":
      return true;

    default:
      return true;
  }
}

async function loadCompanyContext(companyId) {
  return prisma.companies.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      code: true,
      name: true,
      is_active: true,
      status: true,
      subscriptions: {
        orderBy: [{ created_at: "desc" }],
        take: 1,
        select: {
          id: true,
          plan_code: true,
          status: true,
          starts_at: true,
          ends_at: true,
          grace_ends_at: true,
          cancel_at_period_end: true,
          max_users: true,
          max_vehicles: true,
          max_warehouses: true,
          ai_enabled: true,
          analytics_enabled: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  });
}

async function requireCompanyActive(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        message: "Company context is missing",
      });
    }

    const company = await loadCompanyContext(companyId);

    if (!company) {
      return res.status(404).json({
        message: "Company not found",
      });
    }

    if (!company.is_active || company.status !== "ACTIVE") {
      return res.status(403).json({
        message: "Company is not active",
        company_status: company.status,
      });
    }

    const subscription = company.subscriptions?.[0] || null;

    if (!subscription) {
      return res.status(403).json({
        message: "No active subscription found for this company",
      });
    }

    if (!isSubscriptionUsable(subscription)) {
      return res.status(403).json({
        message: "Company subscription is not active",
        subscription_status: subscription.status,
        ends_at: subscription.ends_at,
        grace_ends_at: subscription.grace_ends_at,
      });
    }

    req.companyContext = {
      company,
      subscription,
    };

    return next();
  } catch (error) {
    return res.status(500).json({
      message: "Failed to validate company access",
      error: error?.message || "Unknown error",
    });
  }
}

function requireCompanyFeature(featureKey) {
  return function companyFeatureMiddleware(req, res, next) {
    try {
      const subscription = req.companyContext?.subscription;

      if (!subscription) {
        return res.status(500).json({
          message: "Subscription context is missing",
        });
      }

      const allowed = hasPlanFeature(subscription, featureKey);

      if (!allowed) {
        return res.status(403).json({
          message: "This feature is not available for your current subscription",
          feature_key: featureKey,
          plan_code: subscription.plan_code,
        });
      }

      return next();
    } catch (error) {
      return res.status(500).json({
        message: "Failed to validate company feature",
        error: error?.message || "Unknown error",
      });
    }
  };
}

function requireCompanyLimit(limitKey, counterResolver) {
  return async function companyLimitMiddleware(req, res, next) {
    try {
      const subscription = req.companyContext?.subscription;

      if (!subscription) {
        return res.status(500).json({
          message: "Subscription context is missing",
        });
      }

      const limitValue = subscription?.[limitKey];

      if (limitValue === null || limitValue === undefined) {
        return next();
      }

      const currentCount = await counterResolver(req);

      if (Number(currentCount) >= Number(limitValue)) {
        return res.status(403).json({
          message: "Company plan limit exceeded",
          limit_key: limitKey,
          limit_value: limitValue,
          current_count: currentCount,
        });
      }

      return next();
    } catch (error) {
      return res.status(500).json({
        message: "Failed to validate company limit",
        error: error?.message || "Unknown error",
      });
    }
  };
}

module.exports = {
  requireCompanyActive,
  requireCompanyFeature,
  requireCompanyLimit,
};