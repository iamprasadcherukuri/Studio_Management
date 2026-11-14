import { pool } from "../database/pool.js";
export { masterCode } from "../../shared/master-code.mjs";
export async function masterOptions(client = pool) {
  return (
    await client.query(
      `SELECT v.*,e.entity_code FROM master_entity_value v JOIN master_entity e USING(entity_id) WHERE e.is_active AND v.is_active ORDER BY e.display_order,v.display_order,v.entity_value_id`,
    )
  ).rows;
}
export async function validateMaster(client, code, value, previous) {
  if (previous != null && String(previous) === String(value)) return;
  const found = await client.query(
    `SELECT v.entity_value_id FROM master_entity_value v JOIN master_entity e USING(entity_id) WHERE e.entity_code=$1 AND e.is_active AND v.is_active AND (v.stored_value=$2 OR $2=ANY(v.legacy_aliases)) FOR SHARE OF e,v`,
    [code, String(value)],
  );
  if (!found.rowCount)
    throw Object.assign(
      new Error(
        `Choose an active ${code.toLowerCase().replaceAll("_", " ")} from Settings → Master Management`,
      ),
      { status: 400 },
    );
}
export async function validateRecordMasters(client, kind, data, old) {
  const fields =
    {
      customers: [
        ["title", "CUSTOMER_TITLE"],
        ["gender", "CUSTOMER_GENDER"],
      ],
      albums: [
        ["album_type", "ALBUM_TYPE"],
        ["size", "ALBUM_SIZE"],
      ],
      payments: [["method", "PAYMENT_TYPE"]],
      expenses: [["category", "EXPENSE_CATEGORY"]],
      equipment: [["category", "EQUIPMENT_CATEGORY"]],
      packages: [["package_type", "PACKAGE_TYPE"]],
    }[kind] || [];
  for (const [field, code] of fields)
    if (data[field] != null)
      await validateMaster(client, code, data[field], old?.[field]);
  if (
    kind === "bookings" &&
    String(old?.event_type_id) !== String(data.event_type_id)
  ) {
    const result = await client.query(
      `SELECT v.entity_value_id FROM master_entity_value v JOIN master_entity e USING(entity_id) WHERE e.entity_code='EVENT_TYPE' AND e.is_active AND v.is_active AND (v.legacy_event_type_id=$1 OR EXISTS(SELECT 1 FROM event_types t WHERE t.id=$1 AND (t.name=v.stored_value OR t.name=ANY(v.legacy_aliases)))) FOR SHARE OF e,v`,
      [data.event_type_id],
    );
    if (!result.rowCount)
      throw Object.assign(new Error("Choose an active event type"), {
        status: 400,
      });
  }
}
