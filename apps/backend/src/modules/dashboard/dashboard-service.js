const { AppError } = require("@smo/shared");
const { getPrismaClient } = require("../../lib/prisma");

async function getDashboardMetrics(user) {
  const prisma = getPrismaClient();
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'TENANT_ADMIN') {
    throw new AppError("Unauthorized access to dashboard metrics", 403);
  }

  let storesCount;
  let usersCount;
  let recentOrders;
  let revenueAggregate;

  if (user.role === 'SUPER_ADMIN') {
    [storesCount, usersCount, recentOrders, revenueAggregate] = await Promise.all([
      prisma.store.count(),
      prisma.user.count(),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { store: true }
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'SETTLED' }
      })
    ]);
  } else {
    [storesCount, usersCount, recentOrders, revenueAggregate] = await Promise.all([
      prisma.store.count({
        where: { tenantId: user.tenantId }
      }),
      prisma.user.count({
        where: { tenantId: user.tenantId }
      }),
      prisma.order.findMany({
        where: { store: { tenantId: user.tenantId } },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { store: true }
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { 
          status: 'SETTLED',
          store: { tenantId: user.tenantId }
        }
      })
    ]);
  }

  // totalAmount is stored in whole rupees (converted to paise only at the payment-gateway boundary)
  const totalRevenue = revenueAggregate._sum.totalAmount || 0;

  return {
    metrics: [
      { title: "Total Revenue", value: `₹${totalRevenue.toLocaleString("en-IN")}`, trend: "+12.5%" },
      { title: "Active Stores", value: storesCount.toString(), trend: "+2" },
      { title: "Total Staff", value: usersCount.toString(), trend: "+5%" },
      { title: "Active Orders", value: "24", trend: "+10%" },
    ],
    recentOrders
  };
}

module.exports = {
  getDashboardMetrics
};
