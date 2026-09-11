const { getPrismaClient } = require("../../lib/prisma");
const { createHttpError } = require("../../middleware/error-handler");
const { verifyStoreAccess } = require("../menu/menu-service");
const { broadcastToStore } = require("../orders/sse-service");

// A table shows as RESERVED on the floor this many minutes before the booking starts,
// so staff stop seating walk-ins there.
const RESERVATION_HOLD_MINUTES = 5;
// Pre-filled duration in the reserve dialog; staff can override per booking.
const DEFAULT_RESERVATION_MINUTES = 60;
// Statuses that still hold the table
const LIVE_RESERVATION_STATUSES = ['CONFIRMED', 'SEATED'];

function parseDate(value, field) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) {
    throw createHttpError(400, `${field} must be a valid date-time`);
  }
  return d;
}

/**
 * Throws 409 if another live reservation on the same table overlaps [startsAt, endsAt).
 */
async function assertNoOverlap(prisma, tableId, startsAt, endsAt, excludeId = null) {
  const clash = await prisma.tableReservation.findFirst({
    where: {
      tableId,
      status: { in: LIVE_RESERVATION_STATUSES },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    },
    select: { id: true, guestName: true, startsAt: true, endsAt: true }
  });

  if (clash) {
    throw createHttpError(409, `Table is already reserved for ${clash.guestName} during that time`);
  }
}

async function listReservations(actor, storeId, query = {}) {
  await verifyStoreAccess(actor, storeId);
  const prisma = getPrismaClient();

  const where = { storeId };
  if (query.tableId) where.tableId = query.tableId;
  if (query.status) where.status = query.status;

  // Default window: everything still upcoming or live (endsAt in the future)
  if (query.from || query.to) {
    where.AND = [];
    if (query.from) where.AND.push({ endsAt: { gte: parseDate(query.from, 'from') } });
    if (query.to) where.AND.push({ startsAt: { lte: parseDate(query.to, 'to') } });
  } else if (!query.status || LIVE_RESERVATION_STATUSES.includes(query.status)) {
    where.endsAt = { gte: new Date() };
  }

  return prisma.tableReservation.findMany({
    where,
    include: {
      table: { select: { id: true, tableNumber: true } },
      createdBy: { select: { id: true, name: true } }
    },
    orderBy: { startsAt: 'asc' }
  });
}

async function createReservation(actor, storeId, input) {
  await verifyStoreAccess(actor, storeId);
  const prisma = getPrismaClient();

  const { tableId, guestName, guestPhone, partySize, notes } = input;
  if (!tableId) throw createHttpError(400, "tableId is required");
  if (!guestName || !String(guestName).trim()) throw createHttpError(400, "guestName is required");

  const startsAt = parseDate(input.startsAt, 'startsAt');
  const endsAt = input.endsAt
    ? parseDate(input.endsAt, 'endsAt')
    : new Date(startsAt.getTime() + DEFAULT_RESERVATION_MINUTES * 60 * 1000);

  if (endsAt <= startsAt) throw createHttpError(400, "endsAt must be after startsAt");
  if (endsAt < new Date()) throw createHttpError(400, "Reservation is in the past");

  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table || table.storeId !== storeId || !table.isActive) {
    throw createHttpError(404, "Table not found");
  }

  await assertNoOverlap(prisma, tableId, startsAt, endsAt);

  const reservation = await prisma.tableReservation.create({
    data: {
      storeId,
      tableId,
      guestName: String(guestName).trim(),
      guestPhone: guestPhone ? String(guestPhone).trim() : null,
      partySize: partySize != null && partySize !== '' ? parseInt(partySize, 10) : null,
      notes: notes ? String(notes).trim() : null,
      startsAt,
      endsAt,
      createdById: actor.id
    },
    include: { table: { select: { id: true, tableNumber: true } } }
  });

  broadcastToStore(storeId, 'RESERVATION_UPDATED', reservation);
  return reservation;
}

async function updateReservation(actor, storeId, id, input) {
  await verifyStoreAccess(actor, storeId);
  const prisma = getPrismaClient();

  const existing = await prisma.tableReservation.findUnique({ where: { id } });
  if (!existing || existing.storeId !== storeId) throw createHttpError(404, "Reservation not found");

  const data = {};

  if (input.status !== undefined) {
    if (!['CONFIRMED', 'SEATED', 'CANCELLED', 'COMPLETED'].includes(input.status)) {
      throw createHttpError(400, "Invalid status");
    }
    data.status = input.status;
  }
  if (input.guestName !== undefined) {
    if (!String(input.guestName).trim()) throw createHttpError(400, "guestName cannot be empty");
    data.guestName = String(input.guestName).trim();
  }
  if (input.guestPhone !== undefined) data.guestPhone = input.guestPhone ? String(input.guestPhone).trim() : null;
  if (input.partySize !== undefined) data.partySize = input.partySize !== null && input.partySize !== '' ? parseInt(input.partySize, 10) : null;
  if (input.notes !== undefined) data.notes = input.notes ? String(input.notes).trim() : null;

  const startsAt = input.startsAt !== undefined ? parseDate(input.startsAt, 'startsAt') : existing.startsAt;
  const endsAt = input.endsAt !== undefined ? parseDate(input.endsAt, 'endsAt') : existing.endsAt;
  if (input.startsAt !== undefined || input.endsAt !== undefined) {
    if (endsAt <= startsAt) throw createHttpError(400, "endsAt must be after startsAt");
    data.startsAt = startsAt;
    data.endsAt = endsAt;
  }

  // Only live reservations can clash
  const finalStatus = data.status || existing.status;
  if (LIVE_RESERVATION_STATUSES.includes(finalStatus) && (data.startsAt || data.status)) {
    await assertNoOverlap(prisma, existing.tableId, startsAt, endsAt, id);
  }

  const reservation = await prisma.tableReservation.update({
    where: { id },
    data,
    include: { table: { select: { id: true, tableNumber: true } } }
  });

  broadcastToStore(storeId, 'RESERVATION_UPDATED', reservation);
  return reservation;
}

/**
 * Housekeeping for the cron job: any CONFIRMED/SEATED reservation whose window has
 * fully passed is marked COMPLETED so it stops showing up in "upcoming" lists.
 */
async function completeExpiredReservations() {
  const prisma = getPrismaClient();
  const result = await prisma.tableReservation.updateMany({
    where: {
      status: { in: LIVE_RESERVATION_STATUSES },
      endsAt: { lt: new Date() }
    },
    data: { status: 'COMPLETED' }
  });
  if (result.count > 0) {
    console.log(`[Reservation Job] Marked ${result.count} past reservation(s) as COMPLETED.`);
  }
  return result.count;
}

module.exports = {
  RESERVATION_HOLD_MINUTES,
  DEFAULT_RESERVATION_MINUTES,
  LIVE_RESERVATION_STATUSES,
  listReservations,
  createReservation,
  updateReservation,
  completeExpiredReservations
};
