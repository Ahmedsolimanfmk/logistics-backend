function buildScopeFilters(user, query = {}) {
  return {
    user_id: user?.sub || user?.id || null,
    role: user?.role || null,
    branch_id: query.branch_id || null,
    site_id: query.site_id || null,
  };
}

module.exports = {
  buildScopeFilters,
};