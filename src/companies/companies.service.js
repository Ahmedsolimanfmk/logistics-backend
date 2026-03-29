const prisma = require("../prisma");

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function normalizeUpper(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.toUpperCase() : null;
}

function parseDateOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function parseIntegerOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

function handleBadRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  throw err;
}

async function getCurrentCompany(companyId) {
  const company = await prisma.companies.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      code: true,
      name: true,
      legal_name: true,
      tax_no: true,
      commercial_reg_no: true,
      industry: true,
      country: true,
      timezone: true,
      base_currency: true,
      phone: true,
      email: true,
      address: true,
      logo_url: true,
      is_active: true,
      status: true,
      created_at: true,
      updated_at: true,
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
      settings: {
        orderBy: [{ setting_key: "asc" }],
        select: {
          id: true,
          setting_key: true,
          setting_value: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  });

  if (!company) {
    const err = new Error("Company not found");
    err.statusCode = 404;
    throw err;
  }

  const settingsMap = {};
  for (const item of company.settings || []) {
    settingsMap[item.setting_key] = item.setting_value;
  }

  return {
    ...company,
    current_subscription: company.subscriptions?.[0] || null,
    settings_map: settingsMap,
  };
}

async function updateCurrentCompany(companyId, payload) {
  payload = payload || {};

  const data = {};

  if (payload.code !== undefined) data.code = normalizeUpper(payload.code);
  if (payload.name !== undefined) data.name = toNullableString(payload.name);
  if (payload.legal_name !== undefined) data.legal_name = toNullableString(payload.legal_name);
  if (payload.tax_no !== undefined) data.tax_no = toNullableString(payload.tax_no);
  if (payload.commercial_reg_no !== undefined) {
    data.commercial_reg_no = toNullableString(payload.commercial_reg_no);
  }
  if (payload.industry !== undefined) data.industry = toNullableString(payload.industry);
  if (payload.country !== undefined) data.country = toNullableString(payload.country);
  if (payload.timezone !== undefined) data.timezone = toNullableString(payload.timezone);
  if (payload.base_currency !== undefined) data.base_currency = normalizeUpper(payload.base_currency);
  if (payload.phone !== undefined) data.phone = toNullableString(payload.phone);
  if (payload.email !== undefined) data.email = toNullableString(payload.email);
  if (payload.address !== undefined) data.address = toNullableString(payload.address);
  if (payload.logo_url !== undefined) data.logo_url = toNullableString(payload.logo_url);
  if (payload.is_active !== undefined) data.is_active = Boolean(payload.is_active);
  if (payload.status !== undefined) data.status = normalizeUpper(payload.status);

  if (data.name !== undefined && !data.name) {
    handleBadRequest("Company name cannot be empty");
  }

  if (data.code !== undefined && !data.code) {
    handleBadRequest("Company code cannot be empty");
  }

  try {
    return await prisma.companies.update({
      where: { id: companyId },
      data,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      const err = new Error("Company code already exists");
      err.statusCode = 409;
      throw err;
    }
    throw error;
  }
}

async function listCompanyMembers(companyId, query) {
  query = query || {};

  const q = toNullableString(query.q);
  const role = normalizeUpper(query.company_role);
  const status = normalizeUpper(query.status);
  const isActive =
    query.is_active === "true" ? true :
    query.is_active === "false" ? false :
    undefined;

  const where = {
    company_id: companyId,
  };

  if (role) where.company_role = role;
  if (status) where.status = status;
  if (typeof isActive === "boolean") where.is_active = isActive;

  if (q) {
    where.OR = [
      { users: { full_name: { contains: q, mode: "insensitive" } } },
      { users: { email: { contains: q, mode: "insensitive" } } },
      { users: { phone: { contains: q, mode: "insensitive" } } },
    ];
  }

  const items = await prisma.company_users.findMany({
    where,
    orderBy: [{ joined_at: "desc" }],
    select: {
      id: true,
      company_id: true,
      user_id: true,
      company_role: true,
      status: true,
      is_active: true,
      joined_at: true,
      invited_at: true,
      invited_by: true,
      deactivated_at: true,
      users: {
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
          role: true,
          platform_role: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  });

  return items.map((item) => ({
    ...item,
    user: item.users,
  }));
}

async function getCompanyMemberRecordOrThrow(companyId, targetUserId) {
  const member = await prisma.company_users.findFirst({
    where: {
      company_id: companyId,
      user_id: targetUserId,
    },
    select: {
      id: true,
      company_id: true,
      user_id: true,
      company_role: true,
      status: true,
      is_active: true,
      joined_at: true,
      invited_at: true,
      invited_by: true,
      deactivated_at: true,
      users: {
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
          role: true,
          platform_role: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  });

  if (!member) {
    const err = new Error("Company member not found");
    err.statusCode = 404;
    throw err;
  }

  return member;
}

async function getCompanyMember(companyId, targetUserId) {
  const member = await getCompanyMemberRecordOrThrow(companyId, targetUserId);

  return {
    ...member,
    user: member.users,
  };
}

async function updateCompanyMember(companyId, targetUserId, payload) {
  payload = payload || {};

  const existing = await getCompanyMemberRecordOrThrow(companyId, targetUserId);

  const data = {};

  if (payload.company_role !== undefined) {
    const companyRole = normalizeUpper(payload.company_role);
    if (!companyRole) handleBadRequest("company_role is invalid");
    data.company_role = companyRole;
  }

  if (payload.status !== undefined) {
    const status = normalizeUpper(payload.status);
    if (!status) handleBadRequest("status is invalid");
    data.status = status;
  }

  if (payload.is_active !== undefined) {
    data.is_active = Boolean(payload.is_active);
  }

  if (payload.invited_at !== undefined) {
    const invitedAt = parseDateOrNull(payload.invited_at);
    if (invitedAt === undefined) handleBadRequest("Invalid invited_at");
    data.invited_at = invitedAt;
  }

  if (payload.invited_by !== undefined) {
    data.invited_by = toNullableString(payload.invited_by);
  }

  if (payload.deactivated_at !== undefined) {
    const deactivatedAt = parseDateOrNull(payload.deactivated_at);
    if (deactivatedAt === undefined) handleBadRequest("Invalid deactivated_at");
    data.deactivated_at = deactivatedAt;
  }

  await prisma.company_users.update({
    where: {
      id: existing.id,
    },
    data,
  });

  return getCompanyMember(companyId, targetUserId);
}

async function getCurrentSubscription(companyId) {
  const subscription = await prisma.company_subscriptions.findFirst({
    where: {
      company_id: companyId,
    },
    orderBy: [{ created_at: "desc" }],
  });

  return subscription || null;
}

async function createSubscription(companyId, payload) {
  payload = payload || {};

  const planCode = normalizeUpper(payload.plan_code);
  const status = normalizeUpper(payload.status);
  const startsAt = parseDateOrNull(payload.starts_at);
  const endsAt = parseDateOrNull(payload.ends_at);
  const graceEndsAt = parseDateOrNull(payload.grace_ends_at);
  const maxUsers = parseIntegerOrNull(payload.max_users);
  const maxVehicles = parseIntegerOrNull(payload.max_vehicles);
  const maxWarehouses = parseIntegerOrNull(payload.max_warehouses);

  if (!planCode) handleBadRequest("plan_code is required");
  if (!status) handleBadRequest("status is required");
  if (payload.starts_at !== undefined && startsAt === undefined) {
    handleBadRequest("Invalid starts_at");
  }
  if (payload.ends_at !== undefined && endsAt === undefined) {
    handleBadRequest("Invalid ends_at");
  }
  if (payload.grace_ends_at !== undefined && graceEndsAt === undefined) {
    handleBadRequest("Invalid grace_ends_at");
  }
  if (payload.max_users !== undefined && maxUsers === undefined) {
    handleBadRequest("Invalid max_users");
  }
  if (payload.max_vehicles !== undefined && maxVehicles === undefined) {
    handleBadRequest("Invalid max_vehicles");
  }
  if (payload.max_warehouses !== undefined && maxWarehouses === undefined) {
    handleBadRequest("Invalid max_warehouses");
  }

  return prisma.company_subscriptions.create({
    data: {
      company_id: companyId,
      plan_code: planCode,
      status,
      starts_at: startsAt || new Date(),
      ends_at: endsAt === undefined ? null : endsAt,
      grace_ends_at: graceEndsAt === undefined ? null : graceEndsAt,
      cancel_at_period_end:
        payload.cancel_at_period_end === undefined
          ? false
          : Boolean(payload.cancel_at_period_end),
      max_users: maxUsers === undefined ? null : maxUsers,
      max_vehicles: maxVehicles === undefined ? null : maxVehicles,
      max_warehouses: maxWarehouses === undefined ? null : maxWarehouses,
      ai_enabled:
        payload.ai_enabled === undefined ? true : Boolean(payload.ai_enabled),
      analytics_enabled:
        payload.analytics_enabled === undefined
          ? true
          : Boolean(payload.analytics_enabled),
    },
  });
}

async function listSettings(companyId) {
  const items = await prisma.company_settings.findMany({
    where: { company_id: companyId },
    orderBy: [{ setting_key: "asc" }],
  });

  const settingsMap = {};
  for (const item of items) {
    settingsMap[item.setting_key] = item.setting_value;
  }

  return {
    items,
    settings_map: settingsMap,
  };
}

async function upsertSetting(companyId, payload) {
  payload = payload || {};

  const settingKey = toNullableString(payload.setting_key);
  const settingValue = payload.setting_value;

  if (!settingKey) {
    handleBadRequest("setting_key is required");
  }

  if (settingValue === undefined) {
    handleBadRequest("setting_value is required");
  }

  return prisma.company_settings.upsert({
    where: {
      company_id_setting_key: {
        company_id: companyId,
        setting_key: settingKey,
      },
    },
    create: {
      company_id: companyId,
      setting_key: settingKey,
      setting_value: settingValue,
    },
    update: {
      setting_value: settingValue,
    },
  });
}

async function deleteSetting(companyId, settingKey) {
  const normalizedKey = toNullableString(settingKey);
  if (!normalizedKey) {
    handleBadRequest("setting_key is required");
  }

  const existing = await prisma.company_settings.findFirst({
    where: {
      company_id: companyId,
      setting_key: normalizedKey,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    const err = new Error("Setting not found");
    err.statusCode = 404;
    throw err;
  }

  await prisma.company_settings.delete({
    where: {
      id: existing.id,
    },
  });

  return { ok: true };
}

module.exports = {
  getCurrentCompany,
  updateCurrentCompany,
  listCompanyMembers,
  getCompanyMember,
  updateCompanyMember,
  getCurrentSubscription,
  createSubscription,
  listSettings,
  upsertSetting,
  deleteSetting,
};