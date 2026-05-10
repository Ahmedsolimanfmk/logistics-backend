function requireCompany(req, res, next) {
  if (!req.user || !req.user.company_id) {
    return res.status(400).json({
      message: "Company context missing",
    });
  }

  req.companyId = req.user.company_id;
  next();
}

module.exports = {
  requireCompany, // ⚠️ مهم جدًا
};