// backend/src/fuel/fuel.controller.js
const fuelService = require("./fuel.service");

class FuelController {
  // =====================
  // Super Admin: Stations
  // =====================
  async createStation(req, res, next) {
    try {
      const result = await fuelService.createStation(req.body);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  async listStations(req, res, next) {
    try {
      const items = await fuelService.listStations();
      res.json({ items });
    } catch (e) {
      next(e);
    }
  }

  async updateStation(req, res, next) {
    try {
      const result = await fuelService.updateStation(req.params.id, req.body);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  // =====================
  // Wallet Recharges
  // =====================
  async requestRecharge(req, res, next) {
    try {
      const company_id = req.user.company_id;
      const result = await fuelService.requestRecharge(company_id, req.body);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  async listCompanyRecharges(req, res, next) {
    try {
      const company_id = req.user.company_id;
      const items = await fuelService.listRecharges(company_id);
      res.json({ items });
    } catch (e) {
      next(e);
    }
  }

  async listAllRecharges(req, res, next) {
    try {
      // Super admin
      const items = await fuelService.listRecharges();
      res.json({ items });
    } catch (e) {
      next(e);
    }
  }

  async approveRecharge(req, res, next) {
    try {
      const result = await fuelService.approveRecharge(req.params.id);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  async rejectRecharge(req, res, next) {
    try {
      const result = await fuelService.rejectRecharge(req.params.id);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  // =====================
  // Transactions
  // =====================
  async simulateTransaction(req, res, next) {
    try {
      const result = await fuelService.simulateTransaction(req.body);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  async listCompanyTransactions(req, res, next) {
    try {
      const company_id = req.user.company_id;
      const items = await fuelService.listTransactions(company_id);
      res.json({ items });
    } catch (e) {
      next(e);
    }
  }

  async listAllTransactions(req, res, next) {
    try {
      // Super admin
      const items = await fuelService.listTransactions();
      res.json({ items });
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new FuelController();
