const express = require("express");
const { createApiResponse } = require("@smo/shared");
const { asyncHandler } = require("../../middleware/async-handler");
const { getPrismaClient } = require("../../lib/prisma");
const { decrypt } = require("../../lib/encryption");
const { billingGuard } = require("../../middleware/billing-guard");
const { publicMenuCache } = require("../../lib/cache");
const { createOrder, handleRazorpayWebhook } = require("../orders/order-service");
const { createWaiterCall } = require("../waiter-calls/waiter-call-service");
const { createFeedback } = require("../feedback/feedback-service");

const router = express.Router();

// ---------------------------------------------------------
// Slug Resolution (Unprotected by billing guard so customers can see basic info)
// ---------------------------------------------------------
router.get("/resolve/:brandSlug", asyncHandler(async (req, res) => {
  const prisma = getPrismaClient();
  const tenant = await prisma.tenant.findUnique({
    where: { slug: req.params.brandSlug },
    select: { id: true, name: true, slug: true, logo: true, brandColor: true, description: true, status: true,
      stores: {
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, slug: true, address: true, banner: true }
      }
    }
  });

  if (!tenant) return res.status(404).json(createApiResponse(null, "Brand not found"));
  res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  res.json(createApiResponse(tenant));
}));

router.get("/resolve/:brandSlug/:storeSlug", asyncHandler(async (req, res) => {
  const prisma = getPrismaClient();
  const store = await prisma.store.findFirst({
    where: {
      slug: req.params.storeSlug,
      tenant: { slug: req.params.brandSlug }
    },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true, logo: true, brandColor: true, status: true,
          paymentGateways: {
            where: { provider: 'RAZORPAY', isActive: true },
            select: { merchantId: true, apiKey: true }
          }
        }
      },
      tables: {
        where: { isActive: true },
        select: { id: true, tableNumber: true } // id is needed by the customer app to raise waiter calls
      }
    }
  });

  if (!store) return res.status(404).json(createApiResponse(null, "Store not found"));

  const razorpayGateway = store.tenant.paymentGateways?.[0];
  const responseData = {
    ...store,
    razorpayConfigured: !!razorpayGateway,
    razorpayKeyId: razorpayGateway?.apiKey ? decrypt(razorpayGateway.apiKey) : null
  };
  delete responseData.tenant.paymentGateways; // Clean up response

  res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  res.json(createApiResponse(responseData));
}));

// ---------------------------------------------------------
// SaaS Kill Switch: Protects ALL public Store interactions
// (If rent isn't paid, QR menus go offline)
// ---------------------------------------------------------
router.all("/stores/:storeId/*", billingGuard);

// GET /api/public/stores/:storeId/menu
router.get("/stores/:storeId/menu", asyncHandler(async (req, res) => {
  const { storeId } = req.params;

  const cachedMenu = publicMenuCache.get(storeId);
  if (cachedMenu) {
    res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    return res.json(createApiResponse(cachedMenu));
  }

  const prisma = getPrismaClient();

  // Retrieve categories and items where BOTH isManuallyDisabled and isSystemDisabled are false
  const categories = await prisma.menuCategory.findMany({
    where: { storeId },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        where: {
          isManuallyDisabled: false,
          isSystemDisabled: false
        },
        include: {
          modifierGroups: {
            include: {
              options: true
            }
          }
        }
      }
    }
  });

  // Filter out categories that end up with no items after filtering
  const populatedCategories = categories.filter(category => category.items.length > 0);

  publicMenuCache.set(storeId, populatedCategories);
  res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  res.json(createApiResponse(populatedCategories));
}));

// POST /api/public/stores/:storeId/orders
router.post("/stores/:storeId/orders", asyncHandler(async (req, res) => {
  const prisma = getPrismaClient();
  let tableId = req.body.tableId;
  
  if (!tableId && req.body.tableNumber) {
    const table = await prisma.table.findUnique({
      where: { 
        storeId_tableNumber: { 
          storeId: req.params.storeId, 
          tableNumber: parseInt(req.body.tableNumber) 
        } 
      }
    });
    if (table) {
      tableId = table.id;
    }
  }

  if (!tableId) {
    return res.status(400).json(createApiResponse(null, "Invalid or missing table number"));
  }

  // Attempt to decode Authorization header for pre-paid authenticated orders
  let actor = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const { verifyJwt } = require("../../lib/jwt");
      const token = authHeader.split(' ')[1];
      const decoded = verifyJwt(token);
      if (decoded && decoded.sub) {
        actor = await prisma.user.findUnique({ where: { id: decoded.sub } });
      }
    } catch (err) {
      console.error("Failed to decode optional public auth token:", err.message);
    }
  }

  const payload = { ...req.body, tableId };
  const result = await createOrder(req.params.storeId, actor, 'QR_MENU', payload);
  res.status(201).json(createApiResponse(result));
}));

// GET /api/public/stores/:storeId/orders/me
router.get("/stores/:storeId/orders/me", asyncHandler(async (req, res) => {
  let actor = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const { verifyJwt } = require("../../lib/jwt");
      const token = authHeader.split(' ')[1];
      const decoded = verifyJwt(token);
      if (decoded && decoded.sub) {
        const prisma = getPrismaClient();
        actor = await prisma.user.findUnique({ where: { id: decoded.sub } });
      }
    } catch (err) {}
  }
  
  const sessionId = req.query.sessionId;
  
  if ((!actor || actor.role !== 'CUSTOMER') && !sessionId) {
    return res.status(401).json(createApiResponse(null, "Unauthorized"));
  }
  
  const prisma = getPrismaClient();
  const whereClause = {
    storeId: req.params.storeId,
    status: { in: ['PENDING_VERIFICATION', 'PROCESSING', 'READY', 'SERVED'] }
  };
  
  if (actor) {
    whereClause.customerId = actor.id;
  } else {
    whereClause.sessionId = sessionId;
  }
  
  const orders = await prisma.order.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' }
  });
  
  res.json(createApiResponse(orders));
}));

// GET /api/public/customer/stream
router.get("/customer/stream", (req, res) => {
  const token = req.query.token;
  const sessionId = req.query.sessionId;
  
  if (!token && !sessionId) {
    return res.status(401).json(createApiResponse(null, "Missing token or sessionId"));
  }
  
  const { subscribeToCustomer } = require("../orders/sse-service");
  
  if (token) {
    try {
      const { verifyJwt } = require("../../lib/jwt");
      const decoded = verifyJwt(token);
      if (!decoded || !decoded.sub) {
        return res.status(401).json(createApiResponse(null, "Invalid token"));
      }
      subscribeToCustomer(decoded.sub, req, res);
    } catch (err) {
      return res.status(401).json(createApiResponse(null, "Invalid token"));
    }
  } else if (sessionId) {
    subscribeToCustomer(sessionId, req, res);
  }
});

// POST /api/public/stores/:storeId/orders/:id/verify-payment
router.post("/stores/:storeId/orders/:id/verify-payment", asyncHandler(async (req, res) => {
  // Try to decode optional JWT to get customer actor
  let actor = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const { verifyJwt } = require("../../lib/jwt");
      const token = authHeader.split(' ')[1];
      const decoded = verifyJwt(token);
      if (decoded && decoded.sub) {
        const prisma = getPrismaClient();
        actor = await prisma.user.findUnique({ where: { id: decoded.sub } });
      }
    } catch (err) {}
  }
  
  const { verifyRazorpayPayment } = require("../orders/order-service");
  const result = await verifyRazorpayPayment(actor, req.params.storeId, req.params.id);
  res.json(createApiResponse(result));
}));

// GET /api/public/stores/:storeId/orders/:id
router.get("/stores/:storeId/orders/:id", asyncHandler(async (req, res) => {
  // We can fetch order details publicly if they know the ID, but no sensitive data is returned
  const { getOrderById } = require("../orders/order-service");
  const result = await getOrderById(req.params.storeId, req.params.id);
  res.json(createApiResponse(result));
}));

// POST /api/public/stores/:storeId/calls
router.post("/stores/:storeId/calls", asyncHandler(async (req, res) => {
  const result = await createWaiterCall(req.params.storeId, req.body);
  res.status(201).json(createApiResponse(result));
}));

// POST /api/public/stores/:storeId/feedback
router.post("/stores/:storeId/feedback", asyncHandler(async (req, res) => {
  const result = await createFeedback(req.params.storeId, req.body);
  res.status(201).json(createApiResponse(result));
}));

// POST /api/public/stores/:storeId/validate-promo
router.post("/stores/:storeId/validate-promo", asyncHandler(async (req, res) => {
  const prisma = getPrismaClient();
  const { code, subTotal } = req.body;
  if (!code) return res.status(400).json(createApiResponse(null, "Promo code is required"));
  
  const promo = await prisma.promoCode.findUnique({
     where: { storeId_code: { storeId: req.params.storeId, code: code.toUpperCase() } }
  });
  
  if (!promo || !promo.isActive || (promo.validUntil && promo.validUntil < new Date())) {
     return res.status(400).json(createApiResponse(null, "Invalid or expired promo code"));
  }
  if (subTotal < promo.minOrderValue) {
     return res.status(400).json(createApiResponse(null, `Minimum order value is ₹${promo.minOrderValue}`));
  }
  
  res.json(createApiResponse({
    id: promo.id,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    maxDiscount: promo.maxDiscount
  }));
}));

// GET /api/public/stores/:storeId/tables/:tableNumber/session
router.get("/stores/:storeId/tables/:tableNumber/session", asyncHandler(async (req, res) => {
  const { getTableSessionStatus } = require("../orders/order-service");
  const result = await getTableSessionStatus(req.params.storeId, req.params.tableNumber);
  res.json(createApiResponse(result));
}));

// GET /api/public/stores/:storeId/sessions/:sessionId/bill
router.get("/stores/:storeId/sessions/:sessionId/bill", asyncHandler(async (req, res) => {
  const { getTableSessionBill } = require("../orders/order-service");
  const result = await getTableSessionBill(req.params.storeId, req.params.sessionId);
  res.json(createApiResponse(result));
}));

// POST /api/public/webhooks/razorpay/:tenantId
router.post("/webhooks/razorpay/:tenantId", express.json(), asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    return res.status(400).json(createApiResponse(null, "Missing signature"));
  }
  
  const result = await handleRazorpayWebhook(req.params.tenantId, req.body, signature, req.rawBody);
  res.json(createApiResponse(result));
}));

module.exports = router;
