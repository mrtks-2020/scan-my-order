const express = require("express");
const { createApiResponse } = require("@smo/shared");
const { asyncHandler } = require("../../middleware/async-handler");
const { authenticate, authorizeRoles } = require("../../middleware/auth");
const { userRoles } = require("../../constants/roles");
const {
  listReservations,
  createReservation,
  updateReservation,
  RESERVATION_HOLD_MINUTES,
  DEFAULT_RESERVATION_MINUTES
} = require("./reservation-service");

const router = express.Router({ mergeParams: true });

// Reservations are managed by managers and admins only
router.use(authenticate);
router.use(authorizeRoles(userRoles.superAdmin, userRoles.tenantAdmin, userRoles.storeManager));

// GET /api/stores/:storeId/reservations?tableId=&status=&from=&to=
router.get("/", asyncHandler(async (req, res) => {
  const result = await listReservations(req.user, req.params.storeId, req.query);
  res.json(createApiResponse(result, {
    holdMinutes: RESERVATION_HOLD_MINUTES,
    defaultDurationMinutes: DEFAULT_RESERVATION_MINUTES
  }));
}));

// POST /api/stores/:storeId/reservations
router.post("/", asyncHandler(async (req, res) => {
  const result = await createReservation(req.user, req.params.storeId, req.body);
  res.status(201).json(createApiResponse(result));
}));

// PATCH /api/stores/:storeId/reservations/:id  (edit, or status: SEATED / CANCELLED)
router.patch("/:id", asyncHandler(async (req, res) => {
  const result = await updateReservation(req.user, req.params.storeId, req.params.id, req.body);
  res.json(createApiResponse(result));
}));

module.exports = router;
