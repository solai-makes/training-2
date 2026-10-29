import { createRoute, z } from "@hono/zod-openapi";
import { PRODUCT_CATEGORIES } from "./product-details.ts";

const imageData = z.string().max(1200000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/).nullable().optional();
const imageUrl = z.string().regex(/^\/api\/product-images\/[0-9a-f-]{36}\/[0-9a-f]{64}$/).optional();

export const ProductInput = z
  .object({
    imageData,
    name: z.string().trim().min(1).max(160),
    description: z.string().max(1000).default(""),
    category: z.enum(PRODUCT_CATEGORIES).optional(),
    discountPercent: z.number().int().min(0).max(100).optional(),
    offerStartsAt: z.iso.datetime().nullable().optional(),
    offerEndsAt: z.iso.datetime().nullable().optional(),
    price: z.number().int().min(0).max(9999999),
    stock: z.number().int().min(0).max(2147483647),
  })
  .strict()
  .refine(
    (value) =>
      (!value.offerStartsAt && !value.offerEndsAt) ||
      (!!value.offerStartsAt &&
        !!value.offerEndsAt &&
        Date.parse(value.offerEndsAt) > Date.parse(value.offerStartsAt) &&
        (value.discountPercent ?? 0) > 0),
    {
      message: "Set a positive discount and an end time after the start time.",
    },
  )
  .openapi("ProductInput");

export const ProductUpdateInput = z
  .object({
    imageData,
    name: z.string().trim().min(1).max(160),
    description: z.string().max(1000).default(""),
    category: z.enum(PRODUCT_CATEGORIES).optional(),
    discountPercent: z.number().int().min(0).max(100).optional(),
    offerStartsAt: z.iso.datetime().nullable().optional(),
    offerEndsAt: z.iso.datetime().nullable().optional(),
    price: z.number().int().min(0).max(9999999),
    stock: z.number().int().min(0).max(2147483647),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (value) =>
      (!value.offerStartsAt && !value.offerEndsAt) ||
      (!!value.offerStartsAt &&
        !!value.offerEndsAt &&
        Date.parse(value.offerEndsAt) > Date.parse(value.offerStartsAt) &&
        (value.discountPercent ?? 0) > 0),
    {
      message: "Set a positive discount and an end time after the start time.",
    },
  )
  .openapi("ProductUpdateInput");

export const ProductVariant = z.object({
  imageUrl,
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  label: z.string(),
  color: z.string(),
  size: z.string(),
  basePrice: z.number().optional(),
  discountPercent: z.number().optional(),
});
export const Product = z
  .object({
    imageUrl,
    id: z.uuid(),
    code: z.string().regex(/^A-\d+$/),
    name: z.string(),
    description: z.string(),
    category: z.enum(PRODUCT_CATEGORIES).optional(),
    variantParentId: z.uuid().optional(),
    variants: z.array(ProductVariant).optional(),
    basePrice: z.number().int().nonnegative().optional(),
    discountPercent: z.number().int().min(0).max(100).optional(),
    offerStartsAt: z.iso.datetime().nullable().optional(),
    offerEndsAt: z.iso.datetime().nullable().optional(),
    price: z.number().int().min(0),
    stock: z.number().int().min(0),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Product");

export const ProductList = z
  .object({
    items: z.array(Product),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
  })
  .openapi("ProductList");

export const Pagination = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const OrderItemInput = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(1000),
  })
  .strict()
  .openapi("OrderItemInput");

export const CreateOrderInput = z
  .object({
    items: z.array(OrderItemInput).min(1).max(50),
  })
  .strict()
  .openapi("CreateOrderInput");

export const CartInput = CreateOrderInput.refine(
  (value) =>
    new Set(value.items.map((item) => item.productId)).size ===
    value.items.length,
);
export const Recipient = z
  .object({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(30),
  })
  .strict()
  .openapi("Recipient");
export const CheckoutInput = z
  .object({
    items: z.array(OrderItemInput).min(1).max(50),
    recipient: Recipient,
    expectedTotal: z.number().int().nonnegative().optional(),
    couponCode: z.string().trim().max(50).optional(),
    loyaltyPoints: z.number().int().nonnegative().max(100000000).optional(),
    paymentMethod: z
      .enum(["cod", "razorpay", "paypay", "demo_card", "demo_qr"])
      .optional(),
    currency: z.enum(["JPY", "INR"]).optional(),
    expectedPaymentAmountMinor: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.productId)).size ===
      value.items.length,
  )
  .openapi("CheckoutInput");
export const ReceiptItem = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  code: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  lineTotal: z.number().int().nonnegative(),
});
export const SavedReceipt = z
  .object({
    version: z.literal(1),
    storeName: z.string().optional(),
    loyalty: z.object({pointsRedeemed:z.number().int().nonnegative(),discount:z.number().int().nonnegative(),earnEvery:z.number().int().positive()}).optional(),
    currency: z.literal("JPY"),
    items: z.array(ReceiptItem),
    subtotal: z.number().int().nonnegative(),
    tracking: z
      .object({
        stage: z.enum([
          "confirmed",
          "packed",
          "shipped",
          "out_for_delivery",
          "delivered",
        ]),
        mode: z.literal("automatic_demo").optional(),
        expectedDeliveryAt: z.iso.datetime().optional(),
        nextUpdateAt: z.iso.datetime().nullable().optional(),
        history: z.array(z.object({ stage: z.string(), at: z.iso.datetime() })),
      })
      .optional(),
    discount: z.number().int().nonnegative().optional(),
    coupon: z
      .object({ code: z.string(), percent: z.number().int().min(1).max(100) })
      .optional(),
    tax: z.number().int().nonnegative(),
    shipping: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    recipient: Recipient.nullable(),
    confirmedAt: z.iso.datetime().nullable(),
    payment: z
      .object({
        provider: z.string(),
        state: z.string(),
        currency: z.string(),
        amountMinor: z.number(),
        fxRate: z.number(),
        fxDate: z.string(),
        paymentId: z.string().optional(),
      })
      .optional(),
  })
  .openapi("SavedReceipt");

export const OrderItem = z
  .object({
    id: z.uuid(),
    productId: z.uuid(),
    quantity: z.number().int().min(1),
  })
  .openapi("OrderItem");

export const Order = z
  .object({
    id: z.uuid(),
    status: z.enum(["pending", "confirmed", "cancelled"]),
    items: z.array(OrderItem),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    receipt: SavedReceipt.nullable().optional(),
  })
  .openapi("Order");

export const OrderList = z
  .object({
    items: z.array(Order),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
  })
  .openapi("OrderList");

export const ApiError = z
  .object({
    code: z.string(),
    message: z.string(),
    requestId: z.uuid(),
  })
  .openapi("ApiError");

const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});

const errors = {
  400: {
    description: "Invalid input",
    content: json(ApiError),
  },
  401: {
    description: "Sign in required",
    content: json(ApiError),
  },
  403: {
    description: "Administrator required",
    content: json(ApiError),
  },
  500: {
    description: "Server error",
    content: json(ApiError),
  },
};

export const createProductRoute = createRoute({
  method: "post",
  path: "/products",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: json(ProductInput),
    },
  },
  responses: {
    201: {
      description: "Product created",
      content: json(Product),
    },
    ...errors,
  },
});

export const updateProductRoute = createRoute({
  method: "put",
  path: "/products/{id}",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.uuid(),
    }),
    body: {
      required: true,
      content: json(ProductUpdateInput),
    },
  },
  responses: {
    200: {
      description: "Product updated",
      content: json(Product),
    },
    404: {
      description: "Product not found",
      content: json(ApiError),
    },
    409: {
      description: "Product update conflict",
      content: json(ApiError),
    },
    ...errors,
  },
});

export const deleteProductRoute = createRoute({
  method: "delete",
  path: "/products/{id}",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: "Product deleted",
    },
    404: {
      description: "Product not found",
      content: json(ApiError),
    },
    409: {
      description: "Product cannot be deleted",
      content: json(ApiError),
    },
    ...errors,
  },
});

export const listProductsRoute = createRoute({
  method: "get",
  path: "/products",
  security: [{ bearerAuth: [] }],
  request: {
    query: Pagination,
  },
  responses: {
    200: {
      description: "Product list",
      content: json(ProductList),
    },
    ...errors,
  },
});

export const createOrderRoute = createRoute({
  method: "post",
  path: "/orders",
  request: {
    body: {
      required: true,
      content: json(CreateOrderInput),
    },
  },
  responses: {
    201: {
      description: "Order created",
      content: json(Order),
    },
    ...errors,
  },
});

export const listOrdersRoute = createRoute({
  method: "get",
  path: "/orders",
  request: {
    query: Pagination,
  },
  responses: {
    200: {
      description: "Customer order history",
      content: json(OrderList),
    },
    ...errors,
  },
});

export const confirmOrderRoute = createRoute({
  method: "post",
  path: "/orders/{id}/confirm",
  request: {
    params: z.object({
      id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: "Order confirmed",
      content: json(Order),
    },
    404: {
      description: "Order not found",
      content: json(ApiError),
    },
    409: {
      description: "Insufficient stock",
      content: json(ApiError),
    },
    ...errors,
  },
});

export const cancelOrderRoute = createRoute({
  method: "post",
  path: "/orders/{id}/cancel",
  request: {
    params: z.object({
      id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: "Order cancelled",
      content: json(Order),
    },
    404: {
      description: "Order not found",
      content: json(ApiError),
    },
    ...errors,
  },
});

export const checkoutRoute = createRoute({
  method: "post",
  path: "/checkout",
  security: [{ bearerAuth: [] }],
  request: {
    headers: z.object({ "idempotency-key": z.uuid() }),
    body: { required: true, content: json(CheckoutInput) },
  },
  responses: {
    201: {
      description:
        "Order atomically confirmed; retrying the same key returns the same order",
      content: json(Order),
    },
    409: {
      description: "Stock unavailable or key reused with another payload",
      content: json(ApiError),
    },
    ...errors,
  },
});
export const receiptRoute = createRoute({
  method: "get",
  path: "/orders/{id}/receipt",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: "Saved confirmed-order receipt",
      content: json(
        SavedReceipt.extend({
          orderId: z.uuid(),
          status: z.literal("confirmed"),
        }),
      ),
    },
    404: { description: "Order not found", content: json(ApiError) },
    409: { description: "Receipt unavailable", content: json(ApiError) },
    ...errors,
  },
});
