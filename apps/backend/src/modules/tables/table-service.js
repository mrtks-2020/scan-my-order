const { getPrismaClient } = require("../../lib/prisma");
const { createHttpError } = require("../../middleware/error-handler");
const { verifyStoreAccess } = require("../menu/menu-service");

async function getTables(actor, storeId) {
  await verifyStoreAccess(actor, storeId);
  const prisma = getPrismaClient();
  
  return await prisma.table.findMany({
    where: { storeId },
    orderBy: { tableNumber: 'asc' }
  });
}

const MAX_TABLE_CAPACITY = 50;

function parseCapacity(value) {
  const capacity = parseInt(value, 10);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_TABLE_CAPACITY) {
    throw createHttpError(400, `capacity must be a whole number between 1 and ${MAX_TABLE_CAPACITY}`);
  }
  return capacity;
}

async function createTable(actor, storeId, input) {
  await verifyStoreAccess(actor, storeId);
  const prisma = getPrismaClient();
  const { tableNumber } = input;

  if (typeof tableNumber !== "number") {
    throw createHttpError(400, "tableNumber is required and must be a number");
  }
  if (input.capacity === undefined || input.capacity === null || input.capacity === "") {
    throw createHttpError(400, "capacity is required");
  }
  const capacity = parseCapacity(input.capacity);
  
  // Check if tableNumber already exists for this store
  const existing = await prisma.table.findUnique({
    where: {
      storeId_tableNumber: {
        storeId,
        tableNumber
      }
    }
  });
  
  if (existing) {
    throw createHttpError(409, `Table number ${tableNumber} already exists`);
  }
  
  return await prisma.table.create({
    data: {
      storeId,
      tableNumber,
      capacity
    }
  });
}

async function updateTable(actor, storeId, tableId, input) {
  await verifyStoreAccess(actor, storeId);
  const prisma = getPrismaClient();

  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table || table.storeId !== storeId) {
    throw createHttpError(404, "Table not found");
  }

  const data = {};
  if (input.capacity !== undefined) data.capacity = parseCapacity(input.capacity);
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

  if (Object.keys(data).length === 0) {
    throw createHttpError(400, "Nothing to update");
  }

  return await prisma.table.update({
    where: { id: tableId },
    data
  });
}

async function deleteTable(actor, storeId, tableId) {
  await verifyStoreAccess(actor, storeId);
  const prisma = getPrismaClient();
  
  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table || table.storeId !== storeId) {
    throw createHttpError(404, "Table not found");
  }
  
  // Alternatively, just mark isActive = false if you want soft delete
  return await prisma.table.delete({
    where: { id: tableId }
  });
}

module.exports = {
  getTables,
  createTable,
  updateTable,
  deleteTable
};
