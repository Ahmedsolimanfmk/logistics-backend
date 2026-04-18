function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

function getCompanyIdOrThrow(req) {
  const companyId = req?.companyId || null;

  if (!companyId) {
    const err = new Error("Company context missing");
    err.statusCode = 403;
    throw err;
  }

  return companyId;
}

module.exports = {
  getAuthUserId,
  getCompanyIdOrThrow,
};