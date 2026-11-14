import { z } from "zod";
const id = z.coerce.number().int().positive();
const text = z.string().trim().min(1).max(500);
const optional = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => v || null);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid calendar date",
  );
const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  date.nullable(),
);
// Decimal strings retain every digit; calculations happen in Decimal/PostgreSQL, never JS floats.
const decimal = (places, positive = false) =>
  z
    .union([z.string(), z.number().finite()])
    .transform(String)
    .refine(
      (v) => new RegExp(`^\\d{1,9}(?:\\.\\d{1,${places}})?$`).test(v),
      "Invalid decimal amount",
    )
    .refine((v) => !positive || /[1-9]/.test(v), "Must be positive");
export const enhancementSchemas = {
  invoice: z
    .object({
      booking_id: id,
      invoice_date: date,
      due_date: date,
      discount: decimal(2).default("0"),
      tax_amount: decimal(2).default("0"),
      terms: z.string().max(3000).default(""),
      idempotency_key: z.uuid(),
      items: z
        .array(
          z.object({
            description: text,
            quantity: decimal(3, true),
            unit_price: decimal(2),
          }),
        )
        .min(1)
        .max(50),
    })
    .refine(
      (v) => v.due_date >= v.invoice_date,
      "Due date must follow invoice date",
    )
    .refine(
      (v) => /^0(?:\.0+)?$/.test(v.tax_amount),
      "Tax is disabled until tax rules are configured and approved",
    ),
  equipment: z.object({
    asset_code: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((v) => v.toUpperCase()),
    name: text,
    category: text,
    brand: optional,
    model: optional,
    serial_number: optional,
    purchase_date: optionalDate,
    purchase_cost: decimal(2).default("0"),
    condition: text,
    remarks: optional,
  }),
  assignment: z
    .object({
      equipment_id: id,
      booking_id: id,
      assigned_date: date,
      expected_return_date: date,
      remarks: optional,
    })
    .refine(
      (v) => v.expected_return_date >= v.assigned_date,
      "Expected return cannot be before assignment",
    ),
  return: z.object({ actual_return_date: date }),
  maintenance: z
    .object({
      equipment_id: id,
      maintenance_type: text,
      service_date: date,
      description: text,
      service_provider: optional,
      maintenance_cost: decimal(2).default("0"),
      next_service_date: optionalDate,
      status: z.enum(["In progress", "Completed"]).default("In progress"),
    })
    .refine(
      (v) => !v.next_service_date || v.next_service_date >= v.service_date,
      "Next service cannot be before service date",
    ),
  maintenanceUpdate: z.object({
    status: z.enum(["In progress", "Completed"]),
    next_service_date: optionalDate,
  }),
  expense: z.object({
    existing_expense_id: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      id.optional(),
    ),
    date: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
    method: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["Cash", "UPI", "Bank transfer", "Cheque"]).optional(),
    ),
  }),
  void: z.object({ reason: z.string().trim().min(3).max(1000) }),
};
export function featureInput(kind, body) {
  return enhancementSchemas[kind].parse(body);
}
