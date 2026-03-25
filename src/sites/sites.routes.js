const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const {
  listSites,
  getSiteById,
  createSite,
  updateSite,
  toggleSite,
} = require("./sites.controller");

router.use(authRequired);

router.get("/", listSites);
router.get("/:id", getSiteById);
router.post("/", createSite);
router.put("/:id", updateSite);
router.patch("/:id/toggle", toggleSite);

module.exports = router;