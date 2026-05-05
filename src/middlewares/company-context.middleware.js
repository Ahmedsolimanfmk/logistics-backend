const prisma = require("../prisma");

async function loadCompanyContext(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ message: "Company context missing" });
    }

    const company = await prisma.companies.findUnique({
      where: { id: companyId },
      include: {
        features: true,
      },
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    req.company = company;
    req.features = company.features;

    next();
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load company context",
      error: error.message,
    });
  }
}

module.exports = {
  loadCompanyContext,
};