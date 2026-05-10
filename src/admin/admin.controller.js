const adminService = require("./admin.service");

// =====================
// GET ALL COMPANIES
// =====================
exports.getCompanies = async (req, res) => {
  try {
    const data = await adminService.getCompanies();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to load companies",
      error: e.message,
    });
  }
};

// =====================
// TOGGLE COMPANY
// =====================
exports.toggleCompanyStatus = async (req, res) => {
  try {
    const companyId = req.params.id;

    const data = await adminService.toggleCompany(companyId);

    return res.json({
      ok: true,
      company: data,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to update company",
      error: e.message,
    });
  }
};

// =====================
// COMPANY STATS
// =====================
exports.getCompanyStats = async (req, res) => {
  try {
    const companyId = req.params.id;

    const data = await adminService.getCompanyStats(companyId);

    return res.json(data);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to load stats",
      error: e.message,
    });
  }
};