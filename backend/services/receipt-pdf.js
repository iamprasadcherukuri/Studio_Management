import PDFDocument from "pdfkit";
import Decimal from "decimal.js";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { amountInWords } from "./amount-words.js";
const regular = fileURLToPath(
  new URL("../assets/fonts/NotoSans-Regular.ttf", import.meta.url),
);
const boldPath = fileURLToPath(
  new URL("../assets/fonts/NotoSans-Bold.ttf", import.meta.url),
);
const navy = "#092951",
  blue = "#075eaf",
  pale = "#eaf5ff",
  line = "#9abbdc",
  ink = "#111c2a";
const currency = (value) => {
  const [whole, coins] = new Decimal(value || 0).toFixed(2).split("."),
    tail = whole.slice(-3),
    lead = whole.slice(0, -3);
  return (
    "₹" +
    (lead ? lead.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") +
    tail +
    "." +
    coins
  );
};
const day = (value) =>
  new Date(String(value).slice(0, 10) + "T12:00:00Z").toLocaleDateString(
    "en-GB",
    { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" },
  );
export function renderReceiptPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        info: { Title: data.receipt_number, Author: data.studio.name },
      }),
      chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont("Regular", regular);
      doc.registerFont("Bold", existsSync(boldPath) ? boldPath : regular);
      const text = (
        value,
        x,
        y,
        width,
        size = 10,
        strong = false,
        color = ink,
        height = 30,
        align = "left",
      ) => {
        doc
          .font(strong ? "Bold" : "Regular")
          .fontSize(size)
          .fillColor(color)
          .text(String(value ?? "—"), x, y, {
            width,
            height,
            ellipsis: true,
            align,
            lineGap: 1,
          });
      };
      const box = (x, y, w, h, fill, stroke = line, r = 4) => {
        doc.roundedRect(x, y, w, h, r).fillAndStroke(fill, stroke);
      };
      const rule = (x, y, x2, y2, color = line) =>
        doc
          .moveTo(x, y)
          .lineTo(x2, y2)
          .strokeColor(color)
          .lineWidth(0.6)
          .stroke();
      const camera = (x, y, scale = 1) => {
        doc.save().translate(x, y).scale(scale);
        doc
          .roundedRect(0, 8, 52, 33, 6)
          .lineWidth(2.8)
          .strokeColor(navy)
          .stroke();
        doc.moveTo(12, 8).lineTo(17, 0).lineTo(34, 0).lineTo(40, 8).stroke();
        doc.circle(26, 24, 12).stroke();
        doc.circle(26, 24, 8).stroke();
        doc.restore();
      };
      const icon = (kind, x, y) => {
        doc.save().translate(x, y).lineWidth(1.5).strokeColor(blue);
        if (kind === "mail") {
          doc.rect(0, 1, 12, 9).stroke();
          doc.moveTo(0, 1).lineTo(6, 6).lineTo(12, 1).stroke();
        } else if (kind === "calendar") {
          doc.roundedRect(0, 2, 13, 12, 1).stroke();
          doc
            .moveTo(0, 6)
            .lineTo(13, 6)
            .moveTo(3, 0)
            .lineTo(3, 4)
            .moveTo(10, 0)
            .lineTo(10, 4)
            .stroke();
          for (const xx of [3, 7, 10])
            for (const yy of [9, 12]) doc.rect(xx, yy, 1, 1).fill(blue);
        } else if (kind === "pin") {
          doc
            .moveTo(6, 15)
            .bezierCurveTo(-7, 3, 4, -4, 10, 2)
            .bezierCurveTo(14, 7, 9, 11, 6, 15)
            .stroke();
          doc.circle(6, 5, 2).stroke();
        } else {
          doc
            .moveTo(2, 0)
            .lineTo(0, 3)
            .bezierCurveTo(1, 9, 5, 13, 11, 14)
            .lineTo(14, 11)
            .lineTo(10, 8)
            .lineTo(8, 10)
            .bezierCurveTo(5, 9, 3, 7, 3, 5)
            .lineTo(5, 3)
            .closePath()
            .stroke();
        }
        doc.restore();
      };
      doc.rect(1, 1, 593, 840).lineWidth(1).strokeColor("#d5dfeb").stroke();
      doc
        .moveTo(494, 1)
        .lineTo(594, 1)
        .lineTo(594, 116)
        .lineTo(432, 116)
        .closePath()
        .fill("#d8edff");
      doc
        .moveTo(548, 1)
        .lineTo(594, 1)
        .lineTo(594, 116)
        .lineTo(477, 116)
        .closePath()
        .fill("#9dcbfa");
      if (data.logo)
        doc.image(data.logo, 28, 22, {
          fit: [61, 53],
          align: "center",
          valign: "center",
        });
      else camera(29, 26, 1.12);
      rule(102, 20, 102, 77, navy);
      text(data.studio.name, 114, 17, 285, 23, true, navy, 53);
      text(
        data.studio.tagline || "Photography & Videography Services",
        115,
        71,
        255,
        10,
        false,
        "#495763",
        27,
      );
      doc
        .moveTo(424, 43)
        .lineTo(594, 43)
        .lineTo(594, 77)
        .lineTo(391, 77)
        .closePath()
        .fill(blue);
      text("PAYMENT RECEIPT", 425, 52, 162, 13, true, "#ffffff", 22, "center");
      icon("phone", 22, 101);
      text(data.studio.phone || "—", 42, 98, 128, 9, false, ink, 20);
      icon("mail", 174, 102);
      text(data.studio.email || "—", 193, 98, 183, 9, false, ink, 20);
      icon("pin", 385, 99);
      text(data.studio.address || "—", 405, 97, 173, 9, false, ink, 24);
      rule(1, 124, 594, 124, "#d4dce6");
      box(16, 135, 272, 88, pale, "#e5f0fb");
      for (const [index, label, value] of [
        [0, "Receipt No.", data.receipt_number],
        [1, "Booking No.", data.booking_number],
        [2, "Receipt Date", day(data.receipt_date || data.date)],
        [3, "Payment Date", day(data.date)],
      ]) {
        text(label, 26, 143 + index * 18, 97, 10, true, navy, 17);
        text(":", 124, 143 + index * 18, 8, 10, true, navy, 17);
        text(value, 138, 143 + index * 18, 143, 10, false, ink, 17);
      }
      rule(307, 139, 307, 211, "#9dabb9");
      text("Received From", 326, 137, 245, 12, true, blue, 20);
      text(data.customer.name, 326, 157, 247, 15, true, ink, 29);
      icon("phone", 327, 187);
      text(data.customer.mobile || "—", 348, 184, 224, 10, false, ink, 20);
      icon("mail", 327, 204);
      text(data.customer.email || "—", 348, 202, 224, 9, false, ink, 20);
      box(16, 230, 563, 46, "#f2f8fe", "#c6dcf1");
      icon("calendar", 27, 243);
      text("Event", 48, 237, 196, 8, true, blue, 13);
      text(data.event_type, 48, 251, 196, 10, true, ink, 21);
      rule(251, 238, 251, 268);
      icon("calendar", 264, 243);
      text("Event Date", 285, 237, 134, 8, true, blue, 13);
      text(day(data.event_date), 285, 251, 134, 10, true, ink, 20);
      rule(426, 238, 426, 268);
      icon("pin", 438, 243);
      text("Venue", 459, 237, 111, 8, true, blue, 13);
      text(data.venue, 459, 251, 111, 9, false, ink, 21);
      const y = 290;
      const gradient = doc
        .linearGradient(16, y, 579, y + 26)
        .stop(0, "#cee9ff")
        .stop(1, "#a4d0fa");
      doc.roundedRect(16, y, 563, 26, 4).fill(gradient);
      text("#", 24, y + 5, 28, 11, true, navy, 18, "center");
      text("Description", 65, y + 5, 343, 11, true, navy, 18, "center");
      text("Amount (₹)", 435, y + 5, 134, 11, true, navy, 18, "center");
      text("1", 25, y + 40, 26, 11, false, ink, 22, "center");
      text(data.description, 65, y + 35, 343, 11, false, ink, 36);
      text(
        currency(data.gross_amount),
        432,
        y + 38,
        135,
        12,
        false,
        ink,
        25,
        "right",
      );
      rule(16, y + 26, 579, y + 26);
      rule(16, y + 75, 579, y + 75);
      rule(55, y, 55, y + 75);
      rule(422, y, 422, y + 246);
      const totals = [
        ["Total Amount", data.gross_amount, null],
        [
          (new Decimal(data.payment_discount_amount || 0).gt(0)
            ? "Discount (total)"
            : "Discount") +
            (new Decimal(data.discount_amount).gt(0)
              ? " (" + data.discount_percent + "%)"
              : ""),
          "-" + currency(data.discount_amount),
          "#e3f7dc",
        ],
        ["Amount After Discount", data.final_amount, null],
        ["Previously Paid", data.previously_paid, null],
        ["Current Payment (Received)", data.current_payment, "#d7ebff"],
        [
          new Decimal(data.balance_due).lt(0)
            ? "Credit Balance"
            : "Balance Due",
          new Decimal(data.balance_due).abs().toFixed(2),
          "#a5d3ff",
        ],
      ];
      for (let i = 0; i < totals.length; i++) {
        const [label, value, color] = totals[i],
          yy = y + 75 + i * 28;
        if (color) doc.rect(256, yy, 323, 28).fill(color);
        rule(422, yy, 422, yy + 28);
        text(
          label,
          263,
          yy + 6,
          153,
          i === 4 ? 9 : 10,
          i === 5,
          ink,
          20,
          "right",
        );
        text(
          i === 1 ? value : currency(value),
          429,
          yy + 5,
          139,
          i >= 4 ? 13 : 11,
          i >= 4,
          i === 1 ? "#186721" : navy,
          22,
          "right",
        );
      }
      doc
        .roundedRect(16, y, 563, 243, 4)
        .lineWidth(0.7)
        .strokeColor("#84add6")
        .stroke();
      const details = [
        ["Payment Type", data.payment_type],
        ["Payment Mode", data.method],
        ["Transaction ID", data.reference || "—"],
        [
          "Amount in Words",
          data.amount_in_words || amountInWords(data.current_payment),
        ],
      ];
      if (new Decimal(data.payment_discount_amount || 0).gt(0))
        details.splice(3, 0, [
          "Payment Discount",
          (data.payment_discount_type === "PERCENTAGE"
            ? data.payment_discount_value + "%: "
            : "") +
            currency(data.payment_discount_amount) +
            " on " +
            currency(data.outstanding_before_discount),
        ]);
      let yy = 553;
      for (const [label, value] of details) {
        const extraDiscount = new Decimal(data.payment_discount_amount || 0).gt(
          0,
        );
        const rowHeight =
          label === "Amount in Words"
            ? extraDiscount
              ? 43
              : 48
            : label === "Payment Discount"
              ? 20
              : 25;
        text(label, 21, yy, 107, 10, false, ink, rowHeight - 3);
        text(":", 130, yy, 10, 10, false, ink, 20);
        text(
          value,
          147,
          yy,
          210,
          label === "Amount in Words" ? 9 : 10,
          true,
          ink,
          rowHeight - 3,
        );
        rule(18, yy + rowHeight - 4, 363, yy + rowHeight - 4, "#cdd7e2");
        yy += rowHeight;
      }
      box(16, yy + 3, 349, 25, "#e5f8df", "#c5e8b9");
      text("Discount Details", 23, yy + 8, 112, 9, false, ink, 18);
      text(
        new Decimal(data.discount_amount).gt(0)
          ? data.discount_percent + "% (" + currency(data.discount_amount) + ")"
          : "No discount",
        147,
        yy + 7,
        210,
        10,
        true,
        "#1e6c23",
        20,
      );
      rule(385, 555, 385, 710, "#8aa7c8");
      const reversed = new Decimal(data.reversed_amount || 0),
        status = reversed.gte(data.current_payment)
          ? "Fully Reversed"
          : reversed.gt(0)
            ? "Partially Reversed"
            : "Payment Received";
      box(
        406,
        578,
        169,
        41,
        reversed.gt(0) ? "#fff0df" : "#e5f8df",
        reversed.gt(0) ? "#e4ba86" : "#a5d88d",
        5,
      );
      doc.circle(422, 598, 9).fill(reversed.gt(0) ? "#b97724" : "#329423");
      doc
        .moveTo(418, 598)
        .lineTo(421, 601)
        .lineTo(427, 594)
        .lineWidth(1.8)
        .strokeColor("#ffffff")
        .stroke();
      text(
        status,
        438,
        590,
        132,
        12,
        true,
        reversed.gt(0) ? "#895312" : "#216e1c",
        28,
      );
      if (reversed.gt(0)) {
        text(
          "Reversed since issue: " + currency(reversed),
          407,
          631,
          166,
          9,
          false,
          "#895312",
          26,
        );
        text(
          "Currently retained: " +
            currency(new Decimal(data.current_payment).minus(reversed)),
          407,
          661,
          166,
          9,
          false,
          ink,
          28,
        );
      }
      const extendedRemarks = (data.remarks || "").length > 180,
        extendedAddress = (data.studio.address || "").length > 140;
      const notes = [
        data.basis === "reconstructed"
          ? "Legacy receipt reconstructed from available booking/payment records."
          : "Figures shown as recorded with this payment.",
        extendedRemarks
          ? "Additional remarks continue on the next page."
          : data.remarks || "",
      ]
        .filter(Boolean)
        .join(" ");
      text(notes, 22, 728, 345, 7, false, "#63768c", 24);
      text(
        data.studio.receipt_footer ||
          "Thank you for choosing " + data.studio.name + "!",
        27,
        765,
        347,
        12,
        true,
        navy,
        34,
      );
      if (data.studio.signatory_name)
        text(
          data.studio.signatory_name,
          415,
          724,
          154,
          12,
          true,
          navy,
          26,
          "center",
        );
      rule(413, 753, 571, 753, "#75818d");
      text("Authorized Signatory", 410, 760, 166, 10, false, ink, 18, "center");
      text(
        data.studio.signatory_title || "Studio Manager",
        410,
        780,
        166,
        9,
        false,
        ink,
        17,
        "center",
      );
      doc
        .moveTo(1, 812)
        .bezierCurveTo(150, 855, 407, 844, 594, 812)
        .lineTo(594, 841)
        .lineTo(1, 841)
        .closePath()
        .fill("#a6d7ff");
      doc
        .moveTo(1, 822)
        .bezierCurveTo(170, 867, 435, 842, 594, 832)
        .lineTo(594, 841)
        .lineTo(1, 841)
        .closePath()
        .fill("#0865b5");
      if (extendedRemarks || extendedAddress) {
        doc.addPage({ size: "A4", margin: 0 });
        text(data.studio.name, 40, 30, 515, 22, true, navy, 40);
        text(
          data.receipt_number + " · Additional details",
          40,
          80,
          515,
          12,
          true,
          blue,
          30,
        );
        let offset = 125;
        if (extendedAddress) {
          text("Studio address", 40, offset, 515, 11, true, navy, 24);
          offset += 28;
          doc
            .font("Regular")
            .fontSize(10)
            .fillColor(ink)
            .text(data.studio.address, 40, offset, { width: 515, lineGap: 3 });
          offset = doc.y + 25;
        }
        if (extendedRemarks) {
          text("Remarks", 40, offset, 515, 11, true, navy, 24);
          doc
            .font("Regular")
            .fontSize(10)
            .fillColor(ink)
            .text(data.remarks, 40, offset + 28, { width: 515, lineGap: 3 });
        }
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
