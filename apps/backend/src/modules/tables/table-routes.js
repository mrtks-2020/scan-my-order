const express = require("express");
const { createApiResponse } = require("@smo/shared");
const { asyncHandler } = require("../../middleware/async-handler");
const { authenticate } = require("../../middleware/auth");
const { getTables, createTable, updateTable, deleteTable } = require("./table-service");

const router = express.Router({ mergeParams: true });

router.use(authenticate);

// GET /api/stores/:storeId/tables
router.get("/", asyncHandler(async (req, res) => {
  const result = await getTables(req.user, req.params.storeId);
  res.json(createApiResponse(result));
}));

// POST /api/stores/:storeId/tables
router.post("/", asyncHandler(async (req, res) => {
  const result = await createTable(req.user, req.params.storeId, req.body);
  res.status(201).json(createApiResponse(result));
}));

// PATCH /api/stores/:storeId/tables/:id  (capacity, isActive)
router.patch("/:id", asyncHandler(async (req, res) => {
  const result = await updateTable(req.user, req.params.storeId, req.params.id, req.body);
  res.json(createApiResponse(result));
}));

// DELETE /api/stores/:storeId/tables/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await deleteTable(req.user, req.params.storeId, req.params.id);
  res.json(createApiResponse(result));
}));

module.exports = router;
