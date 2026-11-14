import React, { useEffect, useState } from "react";
import { api, message } from "../services/api";
export default function BookingInformation({
  id,
  close,
  ui: { Modal, ErrorBox, money, date },
}) {
  const [booking, setBooking] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setBooking(null);
    api
      .get(`/bookings/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((r) => {
        if (alive) setBooking(r.data);
      })
      .catch((e) => {
        if (alive && !controller.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [id, retry]);
  const fields = booking
    ? [
        ["Booking number", "#" + booking.id],
        ["Customer", booking.customer_name],
        ["Mobile", booking.customer_mobile],
        ["Email", booking.customer_email],
        ["Event type", booking.event_type],
        ["Event date", date(booking.event_date)],
        ["Venue", booking.location],
        ["Status", booking.status],
        ["Package", booking.package_name],
        ["Total booking amount", money(booking.total_amount)],
        ["Discount", money(booking.discount_amount)],
        ["Agreed amount", money(booking.agreed_amount)],
        ["Net payments received", money(booking.paid)],
        ["Outstanding balance", money(booking.outstanding)],
        ["Assigned staff", booking.staff_names?.join(", ")],
        ["Notes", booking.notes],
      ]
    : [];
  return (
    <Modal title="Booking information" close={close}>
      {loading ? (
        <div className="loading" role="status">
          Loading booking…
        </div>
      ) : error ? (
        <>
          <ErrorBox error={error} />
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </>
      ) : (
        <dl className="booking-information">
          {fields.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}
