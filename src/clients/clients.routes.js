const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const clientsController = require("./clients.controller");

router.use(authRequired);

router.get("/", clientsController.listClients);
router.get("/:id", clientsController.getClientById);

router.post("/", clientsController.createClient);
router.put("/:id", clientsController.updateClient);

// profile update endpoint
router.put("/:id/profile", clientsController.updateClientProfile);

router.patch("/:id/toggle", clientsController.toggleClient);

router.get("/:id/details", clientsController.getClientDetails);
router.get("/:id/dashboard", clientsController.getClientDashboard);

module.exports = router;