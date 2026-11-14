import React, { useEffect, useState } from "react";
import { api, message } from "../services/api";
import { previewPaymentDiscount } from "../services/booking-pricing";
export default function PaymentDiscountPreview({ value, money }) {
  const [booking, setBooking] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setBooking(null);
    setError("");
    if (!value.booking_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(`/bookings/${value.booking_id}`, { signal: controller.signal })
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
  }, [value.booking_id]);
  let preview,
    validation = "";
  if (booking)
    try {
      preview = previewPaymentDiscount(value, booking.outstanding);
    } catch (e) {
      validation = e.message;
    }
  return (
    <div className="payment-discount-preview">
      <p className="help-text">
        Additional discount applies to the outstanding balance before this
        payment. Percentage discounts use that balance. Earlier receipts stay
        unchanged. Reversals refund money; they do not undo the discount.
      </p>
      {loading && <p role="status">Loading booking balance…</p>}
      {(error || validation) && (
        <div className="notice error" role="alert">
          {error || validation}
        </div>
      )}
      {preview && (
        <>
          <dl className="booking-information">
            {[
              ["Outstanding before discount", booking.outstanding],
              ["Additional discount", preview.discount],
              ["Due after discount", preview.due],
              ["Current payment", value.amount || 0],
              ["Balance after payment", preview.balance],
            ].map(([label, amount]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{money(amount)}</dd>
              </div>
            ))}
          </dl>
          {booking.has_active_invoice && Number(preview.discount) > 0 && (
            <div className="notice error" role="alert">
              Void the active invoice before applying this discount, then issue
              a replacement invoice.
            </div>
          )}
        </>
      )}
    </div>
  );
}
