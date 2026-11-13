import React, { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { api, message } from "../services/api";
async function pdfBlob(path) {
  try {
    return (await api.get(path, { responseType: "blob" })).data;
  } catch (error) {
    if (error.response?.data instanceof Blob) {
      try {
        const body = JSON.parse(await error.response.data.text());
        throw new Error(body.error || "Unable to load PDF");
      } catch (parsed) {
        if (parsed instanceof SyntaxError) throw error;
        throw parsed;
      }
    }
    throw error;
  }
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PdfPreview({ path, name, ui, onClose }) {
  const { Modal, ErrorBox } = ui;
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [blob, setBlob] = useState(null);
  const frame = React.useRef(null);
  useEffect(() => {
    let active = true,
      objectUrl;
    pdfBlob(path + "?preview=1")
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setBlob(blob);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return (
    <Modal title={name} close={onClose}>
      <ErrorBox error={error} />
      {url ? (
        <iframe
          ref={frame}
          src={url}
          title={`${name} PDF preview`}
          className="pdf-preview"
        />
      ) : (
        !error && <div className="loading">Preparing PDF…</div>
      )}
      <div className="modal-footer">
        <button
          disabled={!url}
          onClick={() => {
            try {
              frame.current.contentWindow.focus();
              frame.current.contentWindow.print();
            } catch {
              setError("Use the print control in the PDF preview toolbar.");
            }
          }}
        >
          <Printer size={16} />
          Print
        </button>
        <button
          className="primary"
          disabled={!blob}
          onClick={() => saveBlob(blob, name + ".pdf")}
        >
          <Download size={16} />
          Download PDF
        </button>
      </div>
    </Modal>
  );
}
export function ReceiptPdfButton({
  payment,
  ui,
  label = "Download receipt PDF",
  printIcon = false,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-button"
        aria-label={label}
        title="Receipt PDF"
        onClick={() => setOpen(true)}
      >
        {printIcon ? <Printer size={16} /> : <Download size={16} />}
      </button>
      {open && (
        <PdfPreview
          path={`/payments/${payment.id}/receipt/pdf`}
          name={
            payment.receipt_number ||
            "PAY-" + String(payment.id).padStart(5, "0")
          }
          ui={ui}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
export function FeatureSummary({ ui }) {
  const { money } = ui;
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = () => {
    setError("");
    api
      .get("/feature-summary")
      .then((r) => setData(r.data))
      .catch((e) => setError(message(e)));
  };
  useEffect(load, []);
  if (error)
    return (
      <div className="notice error" role="alert">
        {error}
        <button onClick={load}>Retry feature metrics</button>
      </div>
    );
  if (!data)
    return (
      <div className="help-text">Loading invoice and equipment metrics…</div>
    );
  return (
    <div className="feature-metrics">
      {[
        ["Total invoiced", money(data.total_invoiced)],
        ["Invoice outstanding", money(data.invoice_outstanding)],
        ["Total equipment", data.total_equipment],
        ["Available equipment", data.available_equipment],
        ["Assigned equipment", data.assigned_equipment],
        ["Under maintenance", data.maintenance_equipment],
      ].map(([label, value]) => (
        <div className="card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
