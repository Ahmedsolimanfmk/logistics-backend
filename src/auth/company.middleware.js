function requireCompany(req, res, next) {
  // 🔥 1. من التوكن
  let companyId = req.user?.company_id;

  // 🔥 2. fallback من header (مهم جدًا مع الفرونت)
  if (!companyId) {
    companyId = req.headers["x-company-id"];
  }

  if (!companyId) {
    return res.status(400).json({
      message: "Company context missing",
    });
  }

  req.companyId = companyId;

  next();
}

module.exports = {
  requireCompany,
};