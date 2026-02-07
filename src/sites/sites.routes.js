const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const {
  listSites,
  createSite,
  updateSite,
  toggleSite,
} = require("./sites.controller");

router.get("/", authRequired, listSites);
router.post("/", authRequired, createSite);
router.put("/:id", authRequired, updateSite);
router.patch("/:id/toggle", authRequired, toggleSite);

module.exports = router;
