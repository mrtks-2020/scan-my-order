const cron = require('node-cron');
const { getPrismaClient } = require('../lib/prisma');

async function runCleanup(tenantId = null) {
  const prisma = getPrismaClient();
  
  // Calculate date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const whereClause = {
    status: 'CANCELLED',
    updatedAt: {
      lt: thirtyDaysAgo
    }
  };
  
  if (tenantId) {
    whereClause.store = {
      tenantId: tenantId
    };
  }
  
  try {
    const result = await prisma.order.deleteMany({
      where: whereClause
    });
    
    if (result.count > 0) {
      console.log(`[Cleanup Job] Deleted ${result.count} cancelled orders older than 30 days.`);
    }
    return result.count;
  } catch (error) {
    console.error("[Cleanup Job] Error deleting old cancelled orders:", error);
    throw error;
  }
}

// How long an unpaid PREPAID order may sit in PENDING_PAYMENT before it is
// treated as abandoned. Razorpay checkout itself times out well before this.
const PENDING_PAYMENT_TTL_MINUTES = 30;

/**
 * Cancels PENDING_PAYMENT / DRAFT orders that were never completed, so they stop
 * occupying tables on the floor plan. Also settles any TableSession left ACTIVE
 * with no remaining live orders, so the next guest isn't prompted for a stale PIN.
 */
async function expireAbandonedOrders() {
  const prisma = getPrismaClient();
  const cutoff = new Date(Date.now() - PENDING_PAYMENT_TTL_MINUTES * 60 * 1000);

  try {
    const stale = await prisma.order.findMany({
      where: {
        status: { in: ['PENDING_PAYMENT', 'DRAFT'] },
        createdAt: { lt: cutoff }
      },
      select: { id: true, storeId: true, tableSessionId: true }
    });

    if (stale.length === 0) return 0;

    await prisma.order.updateMany({
      where: { id: { in: stale.map(o => o.id) } },
      data: { status: 'CANCELLED' }
    });

    // Close sessions that now have nothing live left in them
    const sessionIds = [...new Set(stale.map(o => o.tableSessionId).filter(Boolean))];
    let closedSessions = 0;
    for (const sessionId of sessionIds) {
      const liveCount = await prisma.order.count({
        where: { tableSessionId: sessionId, status: { notIn: ['SETTLED', 'CANCELLED'] } }
      });
      if (liveCount === 0) {
        await prisma.tableSession.updateMany({
          where: { id: sessionId, status: 'ACTIVE' },
          data: { status: 'CANCELLED' }
        });
        closedSessions++;
      }
    }

    // Let open dashboards refresh their floor plan
    const { broadcastToStore } = require('../modules/orders/sse-service');
    for (const storeId of new Set(stale.map(o => o.storeId))) {
      broadcastToStore(storeId, 'ORDER_CANCELLED', { reason: 'PAYMENT_TIMEOUT' });
    }

    console.log(`[Expiry Job] Cancelled ${stale.length} abandoned order(s), closed ${closedSessions} empty session(s).`);
    return stale.length;
  } catch (error) {
    console.error("[Expiry Job] Error expiring abandoned orders:", error);
    throw error;
  }
}

function startJobs() {
  // Run everyday at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cleanup Job] Running daily cancelled order cleanup...');
    await runCleanup();
  });

  // Every 5 minutes: expire abandoned checkouts and close out past reservations.
  // Reservations are a separate model and are never touched by the order expiry above.
  // Also run once at boot to clear backlog.
  const { completeExpiredReservations } = require('../modules/reservations/reservation-service');
  const runFiveMinuteJobs = () => {
    expireAbandonedOrders().catch(() => {});
    completeExpiredReservations().catch(err => console.error('[Reservation Job]', err));
  };
  cron.schedule('*/5 * * * *', runFiveMinuteJobs);
  runFiveMinuteJobs();

  console.log('[Cleanup Job] Cron jobs scheduled.');
}

module.exports = {
  startJobs,
  runCleanup,
  expireAbandonedOrders,
  PENDING_PAYMENT_TTL_MINUTES
};
