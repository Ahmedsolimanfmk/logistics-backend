const express = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const { loadCompanyContext } = require("../middlewares/company-context.middleware");

const controller = require("./driver-custody.controller");

const router = express.Router();

router.use(authRequired);
router.use(requireCompany);
router.use(loadCompanyContext);3
router.post("/transfer", controller.addTransfer);
router.post("/proof", controller.addDeliveryProof);

// تسجيل استلام فلوس
router.post("/cash", controller.addCashReceipt);

module.exports = router;