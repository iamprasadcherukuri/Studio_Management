const bad = (message, status = 409) =>
  Object.assign(new Error(message), { status });
export async function lockScheduling(c) {
  await c.query(
    "SELECT pg_advisory_xact_lock(hashtext(current_schema()||':equipment-scheduling'))",
  );
}
export async function updateBookingReservations(c, old, next, user) {
  if (old.event_date === next.event_date && next.status !== "cancelled") return;
  const assignments = (
    await c.query(
      "SELECT * FROM equipment_assignments WHERE booking_id=$1 AND status='Active' ORDER BY equipment_id,id FOR UPDATE",
      [old.id],
    )
  ).rows;
  if (!assignments.length) return;
  const today = (
    await c.query(
      "SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text today",
    )
  ).rows[0].today;
  if (assignments.some((a) => a.assigned_date <= today))
    throw bad(
      next.status === "cancelled"
        ? "Return already-issued equipment before cancelling this booking"
        : "Return already-issued equipment before changing the event date",
    );
  if (next.status === "cancelled") {
    for (const a of assignments) {
      await c.query(
        "UPDATE equipment_assignments SET status='Cancelled',cancelled_at=now(),cancelled_by=$1,cancellation_reason='Booking cancelled',updated_at=now() WHERE id=$2",
        [user.id, a.id],
      );
      await c.query(
        "INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'cancel_reservation','equipment_assignments',$2,$3)",
        [
          user.id,
          a.id,
          {
            previous_status: "Active",
            new_status: "Cancelled",
            booking_id: old.id,
          },
        ],
      );
    }
    return;
  }
  const ids = assignments.map((a) => a.id),
    shifted = [];
  await c.query(
    "SELECT id FROM equipment WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",
    [assignments.map((a) => a.equipment_id)],
  );
  for (const a of assignments) {
    if (
      old.event_date < a.assigned_date ||
      old.event_date > a.expected_return_date
    )
      throw bad(
        "An existing reservation does not cover the old event date; review it before rescheduling",
      );
    const dates = (
      await c.query(
        "SELECT ($1::date+($3::date-$4::date))::text AS start,($2::date+($3::date-$4::date))::text AS finish",
        [
          a.assigned_date,
          a.expected_return_date,
          next.event_date,
          old.event_date,
        ],
      )
    ).rows[0];
    if (dates.start < today)
      throw bad(
        "Rescheduling would move an equipment reservation into the past",
      );
    const available = (
      await c.query("SELECT status FROM equipment WHERE id=$1", [
        a.equipment_id,
      ])
    ).rows[0];
    if (available.status !== "Available")
      throw bad("Equipment is unavailable for rescheduling");
    if (
      (
        await c.query(
          "SELECT id FROM equipment_assignments WHERE equipment_id=$1 AND status='Active' AND NOT(id=ANY($2::bigint[])) AND (daterange(assigned_date,expected_return_date,'[]') && daterange($3::date,$4::date,'[]') OR expected_return_date<$5::date)",
          [a.equipment_id, ids, dates.start, dates.finish, today],
        )
      ).rowCount
    )
      throw bad(
        "Equipment has a conflicting reservation on the new event dates",
      );
    if (
      shifted.some(
        (s) =>
          s.equipment_id === a.equipment_id &&
          s.start <= dates.finish &&
          dates.start <= s.finish,
      )
    )
      throw bad("Rescheduled reservation ranges overlap");
    shifted.push({ ...a, ...dates });
  }
  for (const a of shifted) {
    await c.query(
      "UPDATE equipment_assignments SET assigned_date=$1,expected_return_date=$2,updated_at=now() WHERE id=$3",
      [a.start, a.finish, a.id],
    );
    await c.query(
      "INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'reschedule_reservation','equipment_assignments',$2,$3)",
      [
        user.id,
        a.id,
        {
          old_start: a.assigned_date,
          old_end: a.expected_return_date,
          new_start: a.start,
          new_end: a.finish,
          booking_id: old.id,
        },
      ],
    );
  }
}
