// =======================
// src/contracts/contracts.controller.js
// =======================

const service = require("./contracts.service");

// =======================
// CREATE
// =======================
exports.create = async (req, res) => {
  try {
    const result = await service.createContract(req.body);
    return res.status(201).json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
};

// =======================
// LIST
// =======================
exports.list = async (req, res) => {
  try {
    const { client_id, page, limit } = req.query;

    const result = await service.listContracts({
      client_id,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: "Failed to list contracts" });
  }
};

// =======================
// GET BY ID
// =======================
exports.getById = async (req, res) => {
  try {
    const result = await service.getContractById(req.params.id);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
};

// =======================
// UPDATE
// =======================
exports.update = async (req, res) => {
  try {
    const result = await service.updateContract(req.params.id, req.body);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
};

// =======================
// SET STATUS
// =======================
exports.setStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const result = await service.setContractStatus(req.params.id, status);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
};