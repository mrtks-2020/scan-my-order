const express = require("express");
const { createApiResponse } = require("@smo/shared");
const { asyncHandler } = require("../../middleware/async-handler");
const { authenticate } = require("../../middleware/auth");
const {
  createStore,
  getStores,
  getStoreById,
  updateStore,
  deleteStore,
  getStoreFloorStatus
} = require("./store-service");
const menuRoutes = require("../menu/menu-routes");
const inventoryRoutes = require("../inventory/inventory-routes");
const tableRoutes = require("../tables/table-routes");
const orderRoutes = require("../orders/order-routes");
const kdsRoutes = require("../orders/kds-routes");
const waiterCallRoutes = require("../waiter-calls/waiter-call-routes");
const feedbackRoutes = require("../feedback/feedback-routes");
const promoRoutes = require("./promo-routes");
const reservationRoutes = require("../reservations/reservation-routes");
const { billingGuard } = require("../../middleware/billing-guard");

const router = express.Router();

// All store routes require authentication
router.use(authenticate);

router.post("/", asyncHandler(async (req, res) => {
  const result = await createStore(req.user, req.body);
  res.status(201).json(createApiResponse(result));
}));

router.get("/", asyncHandler(async (req, res) => {
  const result = await getStores(req.user, req.query);
  res.json(createApiResponse(result));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const result = await getStoreById(req.user, req.params.id);
  res.json(createApiResponse(result));
}));

router.get("/:id/floor-status", asyncHandler(async (req, res) => {
  const result = await getStoreFloorStatus(req.user, req.params.id, {
    dayStart: req.query.dayStart,
    dayEnd: req.query.dayEnd
  });
  res.json(createApiResponse(result));
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const result = await updateStore(req.user, req.params.id, req.body);
  res.json(createApiResponse(result));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await deleteStore(req.user, req.params.id);
  res.json(createApiResponse(result));
}));

// ---------------------------------------------------------
// SaaS Kill Switch: Protects ALL staff Store interactions
// ---------------------------------------------------------
router.use("/:storeId", billingGuard);

router.use("/:storeId/menu", menuRoutes);
router.use("/:storeId/inventory", inventoryRoutes);
router.use("/:storeId/tables", tableRoutes);
router.use("/:storeId/orders", orderRoutes);
router.use("/:storeId/kds", kdsRoutes);
router.use("/:storeId/calls", waiterCallRoutes);
router.use("/:storeId/feedback", feedbackRoutes);
router.use("/:storeId/promos", promoRoutes);
router.use("/:storeId/reservations", reservationRoutes);

module.exports = router;
