// =======================
// src/contracts/contracts.controller.js
// =======================

const service = require("./contracts.service");

// =======================
// CREATE
// =======================
exports.create = async (req, res) => {
  try {
    const result = await service.createContract({
      ...req.body,
      company_id: req.companyId,
    });

    return res.status(201).json(result);
  } catch (e) {
    return res.status(e.status || e.statusCode || 500).json({
      message: e.message || "Failed to create contract",
    });
  }
};

// =======================
// LIST
// =======================
exports.list = async (req, res) => {
  try {
    const { client_id, page, limit } = req.query;

    const result = await service.listContracts({
      company_id: req.companyId,
      client_id,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });

    return res.json(result);
  } catch (e) {
    return res.status(e.status || e.statusCode || 500).json({
      message: e.message || "Failed to list contracts",
    });
  }
};

// =======================
// GET BY ID
// =======================
exports.getById = async (req, res) => {
  try {
    const result = await service.getContractById(req.params.id, req.companyId);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || e.statusCode || 500).json({
      message: e.message || "Failed to fetch contract",
    });
  }
};

// =======================
// UPDATE
// =======================
exports.update = async (req, res) => {
  try {
    const result = await service.updateContract(
      req.params.id,
      req.body,
      req.companyId
    );
    return res.json(result);
  } catch (e) {
    return res.status(e.status || e.statusCode || 500).json({
      message: e.message || "Failed to update contract",
    });
  }
};

// =======================
// SET STATUS
// =======================
exports.setStatus = async (req, res) => {
  try {
    const { status } = req.body || {};

    const result = await service.setContractStatus(
      req.params.id,
      status,
      req.companyId
    );

    return res.json(result);
  } catch (e) {
    return res.status(e.status || e.statusCode || 500).json({
      message: e.message || "Failed to set contract status",
    });
  }
};