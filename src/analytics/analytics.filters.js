function getUserId(user) {
return user?.sub || user?.id || user?.userId || null;
}

function normalizeString(value) {
const v = String(value || "").trim();
return v || null;
}

function buildScopeFilters(companyId, user, query = {}) {
return {
// ❌ شيلنا company_id من هنا
user_id: getUserId(user),
role: user?.role || null,


// filters فقط
vehicle_hint: normalizeString(query.vehicle_hint),
client_hint: normalizeString(query.client_hint),
site_hint: normalizeString(query.site_hint),
vendor_hint: normalizeString(query.vendor_hint || query.vendor_name),
expense_type: normalizeString(query.expense_type),
paid_method: normalizeString(query.paid_method),
status: normalizeString(query.status),


};
}

module.exports = {
buildScopeFilters,
};
