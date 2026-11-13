import { z } from "zod";
const text = z.string().trim().min(1).max(500);
const optional = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => v || null);
const id = z.coerce.number().int().positive();
const optionalId = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  id.nullable(),
);
const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
    "Use at most two decimal places",
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  date.nullable(),
);
export const methods = ["Cash", "UPI", "Bank transfer", "Cheque"];
export const paymentMethods = [
  "Cash",
  "UPI",
  "Card",
  "Bank transfer",
  "Cheque",
];
export const stages = [
  "Pending",
  "Photo Selection",
  "Editing",
  "Design",
  "Customer Approval",
  "Printing",
  "Ready for Delivery",
  "Delivered",
];
export const schemas = {
  customers: z.object({
    name: text,
    mobile: z
      .string()
      .trim()
      .regex(/^[+\d ()-]{7,20}$/, "Enter a valid mobile number"),
    alternate_mobile: optional,
    email: z
      .union([z.email(), z.literal("")])
      .nullish()
      .transform((v) => v || null),
    address: optional,
  }),
  bookings: z.object({
    customer_id: id,
    event_type_id: id,
    package_id: optionalId,
    event_date: date,
    location: text,
    agreed_amount: money.optional(),
    total_amount: money.optional(),
    discount_type: z.enum(["NONE", "PERCENTAGE", "FIXED"]).optional(),
    discount_value: money.optional(),
    discount_amount: money.optional(),
    notes: optional,
    status: z.enum(["confirmed", "in progress", "completed", "cancelled"]),
    staff_ids: z.array(id).default([]),
  }),
  payments: z.object({
    booking_id: id,
    date,
    amount: money.refine((v) => v > 0, "Amount must be positive"),
    method: z.preprocess(
      (value) => (value === "Bank Transfer" ? "Bank transfer" : value),
      z.enum(paymentMethods),
    ),
    payment_type: z
      .enum(["Payment", "Advance", "Partial", "Installment", "Final"])
      .default("Payment"),
    reference: optional,
    remarks: optional,
    idempotency_key: z.uuid(),
  }),
  albums: z
    .object({
      booking_id: id,
      album_type: text,
      size: text,
      pages: z.coerce.number().int().min(1).max(1000),
      printing_cost: money,
      expected_delivery: optionalDate,
      actual_delivery: optionalDate,
      status: z.enum(stages),
      acknowledgement: optional,
      notes: optional,
    })
    .refine(
      (v) =>
        v.status !== "Delivered" || (v.actual_delivery && v.acknowledgement),
      "Delivery date and acknowledgement are required for delivered albums",
    ),
  expenses: z.object({
    date,
    category: z.enum(["Salaries", "Equipment", "Printing", "Travel", "Other"]),
    description: text,
    amount: money.refine((v) => v > 0, "Amount must be positive"),
    method: z.enum(methods),
    booking_id: optionalId,
    remarks: optional,
  }),
  packages: z.object({ name: text, amount: money, description: optional }),
  staff: z.object({ name: text, mobile: optional }),
  settings: z.object({
    name: text,
    phone: z.string().max(30),
    email: z.union([z.email(), z.literal("")]),
    address: z.string().max(2000),
    tagline: z.string().trim().max(120).optional(),
    signatory_name: z.string().trim().max(100).optional(),
    signatory_title: z.string().trim().max(100).optional(),
    receipt_footer: z.string().trim().max(300).optional(),
    logo_data_url: z.string().max(140000).nullable().optional(),
  }),
  users: z.object({
    name: text,
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(72),
    role: z.enum(["admin", "staff"]),
  }),
  changePassword: z.object({
    current_password: z.string().min(1).max(72),
    new_password: z
      .string()
      .min(12)
      .max(72)
      .refine(
        (v) => Buffer.byteLength(v, "utf8") <= 72,
        "Password must be at most 72 UTF-8 bytes",
      ),
  }),
  resetPassword: z.object({ current_password: z.string().min(1).max(72) }),
};
export function parse(kind, data) {
  return schemas[kind].parse(data);
}
