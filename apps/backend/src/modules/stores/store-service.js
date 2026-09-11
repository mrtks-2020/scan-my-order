const { getPrismaClient } = require("../../lib/prisma");
const { createHttpError } = require("../../middleware/error-handler");
const { userRoles } = require("../../constants/roles");
const { DEFAULT_IMAGES } = require("@smo/shared");
const { RESERVATION_HOLD_MINUTES, LIVE_RESERVATION_STATUSES } = require("../reservations/reservation-service");

function serializeReservation(r) {
  return {
    id: r.id,
    guestName: r.guestName,
    guestPhone: r.guestPhone,
    partySize: r.partySize,
    notes: r.notes,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    status: r.status
  };
}

// Helper to format store and provide default images
function serializeStore(store) {
  if (!store) return store;
  
  return {
    ...store,
    logo: store.tenant?.logo || store.logo || DEFAULT_IMAGES.storeLogo,
    banner: store.banner || DEFAULT_IMAGES.storeBanner
  };
}

async function createStore(actor, input) {
  const prisma = getPrismaClient();
  const { name, slug, banner, adminUser, adminUserId, address, contactPhone, contactEmail, operatingHours, taxRules } = input;

  if (!name || !slug) {
    throw createHttpError(400, "Store name and slug are required");
  }

  // Determine tenantId based on actor's role
  let tenantId;
  if (actor.role === userRoles.superAdmin) {
    tenantId = input.tenantId;
    if (!tenantId) {
      throw createHttpError(400, "tenantId is required for Super Admins creating a store");
    }
  } else if (actor.role === userRoles.tenantAdmin) {
    tenantId = actor.tenantId;
  } else {
    throw createHttpError(403, "Only Super Admins or Tenant Admins can create stores");
  }

  // Check if store slug is already used in this tenant
  const existingStore = await prisma.store.findUnique({
    where: {
      tenantId_slug: { tenantId, slug }
    }
  });

  if (existingStore) {
    throw createHttpError(409, "A store with this slug already exists for this tenant");
  }

  // Ensure at least one active TENANT_ADMIN exists for this tenant, OR we are creating one now
  if (!adminUser) {
    const tenantAdminCount = await prisma.user.count({
      where: {
        tenantId,
        role: userRoles.tenantAdmin,
        status: "ACTIVE"
      }
    });

    if (tenantAdminCount === 0) {
      throw createHttpError(400, "Cannot create a store for a tenant without an active TENANT_ADMIN. Please provide adminUser details.");
    }
  }

  const store = await prisma.$transaction(async (tx) => {
    const newStore = await tx.store.create({
      data: {
        tenantId,
        name,
        slug,
        banner,
        address,
        contactPhone,
        contactEmail,
        operatingHours,
        taxRules
      },
      include: { tenant: true }
    });

    // If adminUser is provided, create the store manager
    if (adminUser) {
      if (!adminUser.name || !adminUser.email || !adminUser.password) {
        throw createHttpError(400, "Name, email, and password are required for the new manager user");
      }
      
      const existingUser = await tx.user.findFirst({
        where: { email: adminUser.email, tenantId }
      });
      
      if (existingUser) {
         throw createHttpError(409, "User with this email already exists in the tenant");
      }
      
      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash(adminUser.password, 12);
      
      await tx.user.create({
        data: {
          tenantId,
          storeId: newStore.id,
          name: adminUser.name,
          email: adminUser.email,
          phone: adminUser.phone,
          passwordHash,
          role: userRoles.storeManager,
          status: "ACTIVE"
        }
      });
      
      // Send email
      try {
        const { getWelcomeEmailTemplate } = require("../../lib/templates/welcome-email");
        const { sendMail } = require("../../lib/mailer");
        const { env } = require("../../config/env");
        
        const html = getWelcomeEmailTemplate(adminUser.name, adminUser.email, adminUser.password, userRoles.storeManager, env.apps.adminUrl || 'http://localhost:5173');
        await sendMail({
          to: adminUser.email,
          subject: "Welcome to Scan My Order",
          html
        });
      } catch (err) {
        console.error("Failed to send welcome email:", err);
      }
    } else if (adminUserId) {
      const existingUser = await tx.user.findUnique({ where: { id: adminUserId } });
      if (!existingUser || existingUser.tenantId !== tenantId) {
        throw createHttpError(404, "User not found in this tenant");
      }
      await tx.user.update({
        where: { id: adminUserId },
        data: {
          storeId: newStore.id,
          role: existingUser.role === userRoles.tenantAdmin ? existingUser.role : userRoles.storeManager
        }
      });
    }

    return newStore;
  });

  return serializeStore(store);
}

async function getStores(actor, query = {}) {
  const prisma = getPrismaClient();
  let where = {};

  if (actor.role === userRoles.tenantAdmin) {
    where.tenantId = actor.tenantId;
  } else if (actor.role === userRoles.storeManager || actor.role === userRoles.waiter || actor.role === userRoles.cashier || actor.role === userRoles.kitchenStaff) {
    where.id = actor.storeId;
  } else if (actor.role === userRoles.superAdmin && query.tenantId) {
    where.tenantId = query.tenantId;
  } else if (actor.role !== userRoles.superAdmin) {
    throw createHttpError(403, "Forbidden");
  }

  const stores = await prisma.store.findMany({ 
    where,
    include: { tenant: true }
  });
  return stores.map(serializeStore);
}

async function getStoreById(actor, storeId) {
  const prisma = getPrismaClient();

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { tenant: true }
  });

  if (!store) {
    throw createHttpError(404, "Store not found");
  }

  // Scope check
  if (actor.role !== userRoles.superAdmin) {
    if (actor.role === userRoles.tenantAdmin && actor.tenantId !== store.tenantId) {
      throw createHttpError(403, "Forbidden");
    }
    if (
      [userRoles.storeManager, userRoles.waiter, userRoles.cashier, userRoles.kitchenStaff].includes(actor.role) &&
      actor.storeId !== store.id
    ) {
      throw createHttpError(403, "Forbidden");
    }
  }

  return serializeStore(store);
}

async function updateStore(actor, storeId, input) {
  const prisma = getPrismaClient();
  
  // Verify access first
  const existingStore = await getStoreById(actor, storeId);

  // Determine if the actor can update. Only SUPER_ADMIN, TENANT_ADMIN, and STORE_MANAGER can update.
  if (
    actor.role !== userRoles.superAdmin &&
    actor.role !== userRoles.tenantAdmin &&
    actor.role !== userRoles.storeManager
  ) {
    throw createHttpError(403, "You do not have permission to update store details");
  }

  const { name, banner, status, adminUser, adminUserId, address, contactPhone, contactEmail, operatingHours, tenantId, taxRules } = input;

  const store = await prisma.$transaction(async (tx) => {
    // Determine the target tenant ID based on whether we are moving the store or keeping it
    const targetTenantId = (actor.role === userRoles.superAdmin && tenantId) ? tenantId : existingStore.tenantId;

    const updatedStore = await tx.store.update({
      where: { id: storeId },
      data: { name, banner, status, address, contactPhone, contactEmail, operatingHours, tenantId: targetTenantId, taxRules },
      include: { tenant: true }
    });

    // If adminUser is provided, create the store manager
    if (adminUser) {
      if (!adminUser.name || !adminUser.email || !adminUser.password) {
        throw createHttpError(400, "Name, email, and password are required for the new manager user");
      }
      
      const existingUser = await tx.user.findFirst({
        where: { email: adminUser.email, tenantId: existingStore.tenantId }
      });
      
      if (existingUser) {
         throw createHttpError(409, "User with this email already exists in the tenant");
      }
      
      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash(adminUser.password, 12);
      
      await tx.user.create({
        data: {
          tenantId: updatedStore.tenantId,
          storeId: updatedStore.id,
          name: adminUser.name,
          email: adminUser.email,
          phone: adminUser.phone,
          passwordHash,
          role: userRoles.storeManager,
          status: "ACTIVE"
        }
      });
      
      // Send email
      try {
        const { getWelcomeEmailTemplate } = require("../../lib/templates/welcome-email");
        const { sendMail } = require("../../lib/mailer");
        const { env } = require("../../config/env");
        
        const html = getWelcomeEmailTemplate(adminUser.name, adminUser.email, adminUser.password, userRoles.storeManager, env.apps.adminUrl || 'http://localhost:5173');
        await sendMail({
          to: adminUser.email,
          subject: "Welcome to Scan My Order",
          html
        });
      } catch (err) {
        console.error("Failed to send welcome email:", err);
      }
    } else if (adminUserId) {
      const existingUser = await tx.user.findUnique({ where: { id: adminUserId } });
      if (!existingUser || existingUser.tenantId !== updatedStore.tenantId) {
        throw createHttpError(404, "User not found in this tenant");
      }
      await tx.user.update({
        where: { id: adminUserId },
        data: {
          storeId: updatedStore.id,
          role: existingUser.role === userRoles.tenantAdmin ? existingUser.role : userRoles.storeManager
        }
      });
    }

    return updatedStore;
  });

  return serializeStore(store);
}

async function deleteStore(actor, storeId) {
  const prisma = getPrismaClient();
  
  // Verify access first
  const existingStore = await getStoreById(actor, storeId);

  if (actor.role !== userRoles.superAdmin && actor.role !== userRoles.tenantAdmin) {
    throw createHttpError(403, "Only Super Admins or Tenant Admins can delete a store");
  }

  await prisma.store.delete({
    where: { id: storeId }
  });

  return { success: true };
}

async function getStoreFloorStatus(actor, storeId, options = {}) {
  const prisma = getPrismaClient();

  // Verify access first
  await getStoreById(actor, storeId);

  const now = new Date();
  const holdMs = RESERVATION_HOLD_MINUTES * 60 * 1000;

  // "Today" for the reservations KPI. The dashboard passes its local-day boundaries so the
  // count matches what staff see on their clock; fall back to the server's local day.
  let dayStart = options.dayStart ? new Date(options.dayStart) : null;
  let dayEnd = options.dayEnd ? new Date(options.dayEnd) : null;
  if (!dayStart || Number.isNaN(dayStart.getTime()) || !dayEnd || Number.isNaN(dayEnd.getTime())) {
    dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  }

  const todaysReservations = await prisma.tableReservation.findMany({
    where: {
      storeId,
      status: { not: 'CANCELLED' },
      startsAt: { gte: dayStart, lt: dayEnd }
    },
    select: { status: true, startsAt: true, partySize: true }
  });
  const reservationsToday = {
    total: todaysReservations.length,
    upcoming: todaysReservations.filter(r => r.status === 'CONFIRMED' && r.startsAt > now).length,
    seated: todaysReservations.filter(r => r.status === 'SEATED').length,
    guests: todaysReservations.reduce((sum, r) => sum + (r.partySize || 0), 0)
  };

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: {
        in: ['DRAFT', 'PENDING_PAYMENT', 'PENDING_VERIFICATION', 'PROCESSING', 'READY', 'SERVED']
      }
    },
    select: {
      id: true,
      origin: true,
      status: true
    }
  });

  const activeTables = await prisma.table.count({
    where: {
      storeId,
      orders: {
        some: {
          status: { in: ['PROCESSING', 'READY', 'SERVED'] }
        }
      }
    }
  });

  const waiterCalls = await prisma.waiterCall.count({
    where: {
      storeId,
      status: { in: ['PENDING', 'ACKNOWLEDGED'] }
    }
  });

  // Fetch all tables with their active orders and unresolved waiter calls.
  // All unsettled orders are fetched (not just the latest) so the floor plan
  // reflects the table's full running tab across multiple order batches.
  const rawTables = await prisma.table.findMany({
    where: {
      storeId,
      isActive: true
    },
    orderBy: { tableNumber: 'asc' },
    include: {
      orders: {
        where: {
          status: {
            in: ['DRAFT', 'PENDING_PAYMENT', 'PENDING_VERIFICATION', 'PROCESSING', 'READY', 'SERVED']
          }
        },
        orderBy: { createdAt: 'asc' },
        include: {
          items: {
            include: {
              menuItem: { select: { name: true } }
            }
          }
        }
      },
      waiterCalls: {
        where: {
          status: { in: ['PENDING', 'ACKNOWLEDGED'] }
        },
        orderBy: { createdAt: 'desc' }
      },
      sessions: {
        where: { status: 'ACTIVE' },
        take: 1
      },
      // Reservations whose hold window is live right now, plus anything later today-ish
      // for the drawer's "Upcoming" list.
      reservations: {
        where: {
          status: { in: LIVE_RESERVATION_STATUSES },
          endsAt: { gt: now }
        },
        orderBy: { startsAt: 'asc' },
        take: 5
      }
    }
  });

  const tables = rawTables.map((tbl) => {
    // A reservation "holds" the table from RESERVATION_HOLD_MINUTES before startsAt until endsAt
    const upcomingReservations = tbl.reservations || [];
    const activeReservation = upcomingReservations.find(r =>
      r.startsAt.getTime() - holdMs <= now.getTime() && now < r.endsAt
    ) || null;
    const activeSession = tbl.sessions?.[0] || null;
    const activeCalls = tbl.waiterCalls || [];
    const hasWaiterCall = activeCalls.length > 0;
    const billCall = activeCalls.find(c => c.type === 'BILL');

    // Orders belonging to the current dining session. If there is no active
    // session (legacy/POS edge cases) fall back to every unsettled order on the table.
    const sessionOrders = activeSession
      ? tbl.orders.filter(o => o.tableSessionId === activeSession.id)
      : tbl.orders;
    const latestOrder = sessionOrders[sessionOrders.length - 1] || null;

    // Table status reflects the most action-worthy batch, not just the latest one:
    // NEEDS_VERIFICATION (waiter must approve a QR postpaid order) > READY (needs delivering)
    // > PROCESSING (cooking) > OCCUPIED (awaiting online payment) > SERVED (awaiting bill)
    const orderStatuses = new Set(sessionOrders.map(o => o.status));
    let status = 'AVAILABLE';
    if (billCall) {
      status = 'BILL_REQUESTED';
    } else if (hasWaiterCall) {
      status = 'ATTENTION';
    } else if (orderStatuses.has('PENDING_VERIFICATION')) {
      status = 'NEEDS_VERIFICATION';
    } else if (orderStatuses.has('READY')) {
      status = 'READY';
    } else if (orderStatuses.has('PROCESSING')) {
      status = 'PROCESSING';
    } else if (orderStatuses.has('PENDING_PAYMENT') || orderStatuses.has('DRAFT')) {
      status = 'OCCUPIED';
    } else if (orderStatuses.has('SERVED')) {
      status = 'SERVED';
    } else if (activeReservation) {
      // A reservation only claims an otherwise-empty table; live orders always take precedence
      status = 'RESERVED';
    }

    // Merge identical items across batches so the tab reads like a single bill
    const mergedItems = new Map();
    for (const order of sessionOrders) {
      for (const item of order.items) {
        const name = item.menuItem?.name || 'Item';
        const key = `${item.menuItemId}_${item.priceAtOrder}`;
        const existing = mergedItems.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          mergedItems.set(key, { name, quantity: item.quantity, priceAtOrder: item.priceAtOrder });
        }
      }
    }

    return {
      id: tbl.id,
      tableNumber: tbl.tableNumber,
      capacity: tbl.capacity,
      isActive: tbl.isActive,
      status,
      activePin: activeSession?.pin || null,
      activeSessionId: activeSession?.id || null,
      // The reservation currently holding the table (if any) — shown as a tag even when orders are live
      reservation: activeReservation ? serializeReservation(activeReservation) : null,
      // Later bookings on this table, for the drawer
      upcomingReservations: upcomingReservations
        .filter(r => r.id !== activeReservation?.id)
        .map(serializeReservation),
      hasWaiterCall,
      activeWaiterCalls: activeCalls.map(c => ({
        id: c.id,
        type: c.type,
        status: c.status,
        createdAt: c.createdAt
      })),
      // `currentOrder` is the table's whole running tab (all batches in the session),
      // not a single order. `id`/`status`/`origin` describe the latest batch.
      currentOrder: latestOrder ? {
        id: latestOrder.id,
        status: latestOrder.status,
        origin: latestOrder.origin,
        paymentModel: latestOrder.paymentModel,
        totalAmount: sessionOrders.reduce((sum, o) => sum + o.totalAmount, 0),
        createdAt: sessionOrders[0].createdAt,
        ordersCount: sessionOrders.length,
        itemsCount: sessionOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0),
        items: Array.from(mergedItems.values())
      } : null
    };
  });

  return {
    orders,
    activeTables,
    waiterCalls,
    reservationsToday,
    tables
  };
}

module.exports = {
  createStore,
  getStores,
  getStoreById,
  updateStore,
  deleteStore,
  getStoreFloorStatus
};
