import React, { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Download,
  Printer,
  Eye,
  Pencil,
  RotateCcw,
  Package,
  FileText,
} from "lucide-react";
import { api, message } from "../services/api";
const categories = [
  "Cameras",
  "Lenses",
  "Lighting",
  "Tripods",
  "Audio",
  "Accessories",
  "Other",
];
const methods = ["Cash", "UPI", "Bank transfer", "Cheque"];
const definitions = {
  invoice: [
    ["booking_id", "Booking", "bookings"],
    ["invoice_date", "Invoice date", "date"],
    ["due_date", "Due date", "date"],
    ["discount", "Discount (₹)", "number"],
    ["terms", "Terms", "textarea", false],
  ],
  equipment: [
    ["asset_code", "Asset code"],
    ["name", "Equipment name"],
    ["category", "Category", categories],
    ["brand", "Brand", "text", false],
    ["model", "Model", "text", false],
    ["serial_number", "Serial number", "text", false],
    ["purchase_date", "Purchase date", "date", false],
    ["purchase_cost", "Purchase cost (₹)", "number"],
    ["condition", "Condition"],
    ["remarks", "Remarks", "textarea", false],
  ],
  assignment: [
    ["equipment_id", "Equipment", "equipment"],
    ["booking_id", "Booking", "bookings"],
    ["assigned_date", "Assigned date", "date"],
    ["expected_return_date", "Expected return date", "date"],
    ["remarks", "Remarks", "textarea", false],
  ],
  maintenance: [
    ["equipment_id", "Equipment", "equipment"],
    ["maintenance_type", "Maintenance type"],
    ["service_date", "Service date", "date"],
    ["description", "Description"],
    ["service_provider", "Service provider", "text", false],
    ["maintenance_cost", "Maintenance cost (₹)", "number"],
    ["next_service_date", "Next service date", "date", false],
    ["status", "Status", ["In progress", "Completed"]],
  ],
  serviceUpdate: [
    ["status", "Status", ["In progress", "Completed"]],
    ["next_service_date", "Next service date", "date", false],
  ],
  expense: [
    [
      "existing_expense_id",
      "Link existing Equipment expense",
      "expenses",
      false,
    ],
    ["date", "Payment date", "date", false],
    ["method", "Payment method", methods, false],
  ],
  return: [["actual_return_date", "Actual return date", "date"]],
};
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
export function ReceiptPdfButton({ payment, ui }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-button"
        aria-label="Download receipt PDF"
        title="Receipt PDF"
        onClick={() => setOpen(true)}
      >
        <Download size={16} />
      </button>
      {open && (
        <PdfPreview
          path={`/payments/${payment.id}/receipt/pdf`}
          name={"PAY-" + String(payment.id).padStart(5, "0")}
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
export function InvoicesPage({ ui }) {
  const { Heading, Modal, FormFields, Table, Empty, ErrorBox, money, today } =
    ui;
  const [rows, setRows] = useState([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [form, setForm] = useState(null),
    [lookups, setLookups] = useState({ bookings: [] }),
    [detail, setDetail] = useState(null),
    [preview, setPreview] = useState(null),
    [voiding, setVoiding] = useState(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => {
    setLoading(true);
    api
      .get("/invoices", { params: { page, search, status } })
      .then((r) => {
        setRows(r.data.data);
        setTotal(r.data.total);
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [page, search, status]);
  async function start() {
    setError("");
    try {
      setLookups((await api.get("/lookups")).data);
      setForm({
        booking_id: "",
        invoice_date: today(),
        due_date: today(),
        discount: "0",
        terms: "",
        idempotency_key: crypto.randomUUID(),
        items: [
          {
            description: "Photography coverage",
            quantity: "1",
            unit_price: "0",
          },
        ],
      });
    } catch (e) {
      setError(message(e));
    }
  }
  async function setInvoiceForm(next) {
    const changed = next.booking_id !== form.booking_id;
    setForm(next);
    if (changed && next.booking_id) {
      try {
        const { data } = await api.get("/invoices/booking/" + next.booking_id);
        setForm((current) =>
          current?.booking_id === next.booking_id
            ? {
                ...current,
                agreed_amount: data.agreed_amount,
                items: [
                  {
                    description: data.event_type + " photography",
                    quantity: "1",
                    unit_price: data.agreed_amount,
                  },
                ],
                discount: "0",
              }
            : current,
        );
      } catch (e) {
        setError(message(e));
      }
    }
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/invoices", form);
      setForm(null);
      setDetail(data);
      setNotice("Invoice issued. No payment has been created.");
      load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function view(row) {
    setError("");
    try {
      setDetail((await api.get("/invoices/" + row.id)).data);
    } catch (e) {
      setError(message(e));
    }
  }
  async function voidInvoice(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/invoices/${voiding.id}/void`, {
        reason,
      });
      setVoiding(null);
      setDetail(data);
      setNotice("Invoice voided. Existing payments are unchanged.");
      load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="BOOKING BILLING"
        title="Invoices"
        subtitle="Issue booking invoices and keep a clear billing history."
      >
        <button className="primary" onClick={start}>
          <Plus size={17} />
          Create invoice
        </button>
      </Heading>
      {!form && !voiding && <ErrorBox error={error} />}{" "}
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      <section className="card">
        <div className="toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search invoices"
              placeholder="Invoice number, booking or customer…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Invoice status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All invoices</option>
            <option>Issued</option>
            <option>Void</option>
          </select>
          <span className="record-count">{total} invoices</span>
        </div>
        {loading ? (
          <div className="loading">Loading invoices…</div>
        ) : rows.length ? (
          <Table
            rows={rows}
            keys={[
              "invoice_number",
              "customer_name",
              "booking_id",
              "invoice_date",
              "due_date",
              "total_amount",
              "paid_amount",
              "balance_amount",
              "payment_status",
            ]}
            actions={(row) => (
              <>
                <button
                  className="icon-button"
                  aria-label="View invoice"
                  onClick={() => view(row)}
                >
                  <Eye size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Invoice PDF"
                  onClick={() => setPreview(row)}
                >
                  <Download size={16} />
                </button>
              </>
            )}
          />
        ) : (
          <Empty
            text="No invoices found"
            detail="Create an invoice from an existing booking."
          />
        )}
        <div className="pagination">
          <span>
            Page {page} · {total} records
          </span>
          <div>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              disabled={page * 20 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <p className="help-text">
        One active invoice per booking. Tax is disabled. Item totals minus
        discount must equal the agreed booking amount. Invoice creation does not
        add receipts or change net cash balance.
      </p>
      {form && (
        <Modal
          title="Create invoice"
          close={() => {
            if (!busy) {
              setForm(null);
              setError("");
            }
          }}
        >
          <form onSubmit={save}>
            <ErrorBox error={error} />
            <FormFields
              kind="invoice"
              definitions={definitions}
              value={form}
              setValue={setInvoiceForm}
              lookups={lookups}
            />
            {form.agreed_amount && (
              <p className="help-text">
                Agreed booking amount:{" "}
                <strong>{money(form.agreed_amount)}</strong>
              </p>
            )}
            <div className="invoice-items">
              <h3>Invoice items</h3>
              {form.items.map((item, index) => (
                <div className="invoice-item" key={index}>
                  <label>
                    Description
                    <input
                      required
                      maxLength={500}
                      value={item.description}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          items: form.items.map((v, i) =>
                            i === index
                              ? { ...v, description: e.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Quantity
                    <input
                      required
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          items: form.items.map((v, i) =>
                            i === index
                              ? { ...v, quantity: e.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Unit price (₹)
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          items: form.items.map((v, i) =>
                            i === index
                              ? { ...v, unit_price: e.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={form.items.length === 1}
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() =>
                      setForm({
                        ...form,
                        items: form.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={form.items.length >= 50}
                onClick={() =>
                  setForm({
                    ...form,
                    items: [
                      ...form.items,
                      { description: "", quantity: "1", unit_price: "0" },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Add item
              </button>
            </div>
            <p className="help-text">
              Amounts are calculated on the server using exact decimal
              arithmetic. No tax is applied.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Issuing…" : "Issue invoice"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.invoice_number} close={() => setDetail(null)}>
          <div className="document-summary">
            <strong>{detail.customer_snapshot.name}</strong>
            <span>
              Booking #{detail.booking_id} · {detail.payment_status}
            </span>
            <span>Total: {money(detail.total_amount)}</span>
            <span>Received: {money(detail.paid_amount)}</span>
            <span>Outstanding: {money(detail.balance_amount)}</span>
          </div>
          <Table
            rows={detail.items}
            keys={["description", "quantity", "unit_price", "line_total"]}
          />
          <p className="help-text">
            Discount: {money(detail.discount)} · Tax: not applied
          </p>
          {detail.void_reason && (
            <div className="notice error">Voided: {detail.void_reason}</div>
          )}
          {detail.terms && <p className="help-text">{detail.terms}</p>}
          <h3 className="feature-section-title">Invoice history</h3>
          <Table
            rows={detail.history}
            keys={["action", "user_name", "created_at"]}
          />
          <div className="modal-footer">
            {detail.status === "Issued" && (
              <button
                className="danger"
                onClick={() => {
                  setVoiding(detail);
                  setDetail(null);
                  setReason("");
                }}
              >
                Void invoice
              </button>
            )}
            <button
              className="primary"
              onClick={() => {
                setPreview(detail);
                setDetail(null);
              }}
            >
              <Printer size={15} />
              Preview / print PDF
            </button>
          </div>
        </Modal>
      )}
      {voiding && (
        <Modal
          title="Void invoice?"
          close={() => {
            if (!busy) setVoiding(null);
          }}
        >
          <form onSubmit={voidInvoice}>
            <ErrorBox error={error} />
            <p>
              The invoice remains in history. Existing payments are retained,
              and a replacement invoice can be issued.
            </p>
            <label className="feature-section-title">
              Reason
              <textarea
                required
                minLength={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="modal-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => setVoiding(null)}
              >
                Keep invoice
              </button>
              <button className="danger-button" disabled={busy}>
                {busy ? "Voiding…" : "Confirm void"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {preview && (
        <PdfPreview
          path={`/invoices/${preview.id}/pdf`}
          name={preview.invoice_number}
          ui={ui}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
export function EquipmentPage({ ui }) {
  const { Heading, Modal, FormFields, Table, Empty, ErrorBox, today, money } =
    ui;
  const [tab, setTab] = useState("equipment"),
    [rows, setRows] = useState([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [form, setForm] = useState(null),
    [action, setAction] = useState(""),
    [lookups, setLookups] = useState({
      equipment: [],
      bookings: [],
      expenses: [],
    }),
    [detail, setDetail] = useState(null),
    [retiring, setRetiring] = useState(null),
    [busy, setBusy] = useState(false),
    [metrics, setMetrics] = useState(null);
  const load = () => {
    setLoading(true);
    api
      .get("/" + tab, {
        params: {
          page,
          search: tab === "equipment" ? search : undefined,
          category: tab === "equipment" ? category : undefined,
          status: tab === "equipment" ? status : undefined,
        },
      })
      .then((r) => {
        setRows(r.data.data);
        setTotal(r.data.total);
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
    api
      .get("/feature-summary")
      .then((r) => setMetrics(r.data))
      .catch((e) => setError(message(e)));
  };
  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [tab, page, search, category, status]);
  async function start(kind, row) {
    setError("");
    setDetail(null);
    try {
      const [lookup, assets, expenses] = await Promise.all([
        api.get("/lookups"),
        api.get("/equipment/options"),
        kind === "expense"
          ? api.get("/equipment/expense-options")
          : Promise.resolve({ data: { data: [] } }),
      ]);
      setLookups({
        ...lookup.data,
        equipment: assets.data.data
          .filter((e) => e.status !== "Retired")
          .map((e) => ({ ...e, name: e.asset_code + " · " + e.name })),
        expenses: expenses.data.data.map((e) => ({
          ...e,
          name: "#" + e.id + " · " + e.description + " · " + money(e.amount),
        })),
      });
      setAction(kind);
      setForm(
        row
          ? { ...row }
          : kind === "equipment"
            ? { purchase_cost: "0", condition: "Good" }
            : kind === "assignment"
              ? { assigned_date: today(), expected_return_date: today() }
              : kind === "maintenance"
                ? {
                    service_date: today(),
                    status: "In progress",
                    maintenance_cost: "0",
                  }
                : kind === "expense"
                  ? { date: today(), method: "Cash" }
                  : { actual_return_date: today() },
      );
    } catch (e) {
      setError(message(e));
    }
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "equipment")
        await (form.id
          ? api.put("/equipment/" + form.id, form)
          : api.post("/equipment", form));
      if (action === "assignment")
        await api.post("/equipment-assignments", form);
      if (action === "maintenance")
        await api.post("/equipment-maintenance", form);
      if (action === "serviceUpdate")
        await api.patch("/equipment-maintenance/" + form.id, form);
      if (action === "return")
        await api.patch("/equipment-assignments/" + form.id + "/return", form);
      if (action === "expense")
        await api.post("/equipment-maintenance/" + form.id + "/expense", form);
      setForm(null);
      setNotice(
        action === "expense"
          ? "Paid expense linked once to this maintenance record."
          : "Equipment record saved.",
      );
      load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function view(row) {
    setError("");
    try {
      setDetail((await api.get("/equipment/" + row.id)).data);
    } catch (e) {
      setError(message(e));
    }
  }
  async function retire() {
    setBusy(true);
    setError("");
    try {
      await api.patch("/equipment/" + retiring.id + "/retire");
      setRetiring(null);
      setDetail(null);
      setNotice("Equipment retired. All history is retained.");
      load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const names = {
    equipment: form?.id ? "Edit equipment" : "Add equipment",
    assignment: "Assign equipment",
    maintenance: "Add maintenance",
    serviceUpdate: "Update maintenance",
    return: "Return equipment",
    expense: "Record paid maintenance expense",
  };
  const maintenanceActions = (row) => (
    <>
      <button className="text-link" onClick={() => start("serviceUpdate", row)}>
        Update
      </button>
      {row.expense_id ? (
        <span className="subtle-tag">Expense #{row.expense_id}</span>
      ) : (
        <button
          className="text-link"
          onClick={() =>
            start("expense", { id: row.id, date: today(), method: "Cash" })
          }
        >
          Record / link expense
        </button>
      )}
    </>
  );
  return (
    <>
      <Heading
        eyebrow="TOOLS OF YOUR TRADE"
        title="Equipment"
        subtitle="Track your assets, reservations, returns and servicing."
      >
        <button onClick={() => start("assignment")}>
          <Plus size={16} />
          Assign equipment
        </button>
        <button className="primary" onClick={() => start("equipment")}>
          <Plus size={17} />
          Add equipment
        </button>
      </Heading>
      {metrics && (
        <div className="feature-metrics equipment-metrics">
          {[
            ["Total equipment", metrics.total_equipment],
            ["Available", metrics.available_equipment],
            ["Assigned", metrics.assigned_equipment],
            ["Maintenance", metrics.maintenance_equipment],
          ].map(([label, value]) => (
            <div className="card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {!form && !retiring && <ErrorBox error={error} />}{" "}
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      <section className="card">
        <div className="feature-tabs">
          {[
            ["equipment", "Inventory"],
            ["equipment-assignments", "Assignments"],
            ["equipment-maintenance", "Maintenance"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => {
                setTab(value);
                setPage(1);
                setError("");
              }}
            >
              {label}
            </button>
          ))}
          <button className="text-link" onClick={() => start("maintenance")}>
            <Plus size={15} />
            Add maintenance
          </button>
        </div>
        {tab === "equipment" && (
          <div className="toolbar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Search equipment"
                placeholder="Asset code, name or serial…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              aria-label="Equipment category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label="Equipment status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {["Available", "Assigned", "Maintenance", "Retired"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        )}
        {loading ? (
          <div className="loading">Loading equipment records…</div>
        ) : rows.length ? (
          <Table
            rows={
              tab === "equipment"
                ? rows.map((r) => ({ ...r, status: r.availability }))
                : rows
            }
            keys={
              tab === "equipment"
                ? [
                    "asset_code",
                    "name",
                    "category",
                    "condition",
                    "purchase_cost",
                    "status",
                  ]
                : tab === "equipment-assignments"
                  ? [
                      "asset_code",
                      "equipment_name",
                      "booking_id",
                      "customer_name",
                      "assigned_date",
                      "expected_return_date",
                      "actual_return_date",
                      "status",
                    ]
                  : [
                      "asset_code",
                      "maintenance_type",
                      "service_date",
                      "maintenance_cost",
                      "next_service_date",
                      "status",
                      "expense_id",
                    ]
            }
            actions={(row) =>
              tab === "equipment" ? (
                <>
                  <button
                    className="icon-button"
                    aria-label="View equipment"
                    onClick={() => view(row)}
                  >
                    <Eye size={16} />
                  </button>
                  {row.status !== "Retired" && (
                    <button
                      className="icon-button"
                      aria-label="Edit equipment"
                      onClick={() => start("equipment", row)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </>
              ) : tab === "equipment-assignments" ? (
                row.status === "Active" && (
                  <button
                    className="text-link"
                    onClick={() =>
                      start("return", {
                        id: row.id,
                        actual_return_date: today(),
                      })
                    }
                  >
                    <RotateCcw size={14} />
                    Return
                  </button>
                )
              ) : (
                maintenanceActions(row)
              )
            }
          />
        ) : (
          <Empty
            text="No equipment records found"
            detail="Add equipment, reserve it for a booking, or record a service."
          />
        )}
        <div className="pagination">
          <span>
            Page {page} · {total} records
          </span>
          <div>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              disabled={page * 20 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <p className="help-text">
        Reservations include both assignment and return days. Overdue unreturned
        assets remain unavailable. Future reservations appear in assignment
        history; Assigned counts equipment currently out. Purchase and
        maintenance costs are informational until explicitly recorded as paid
        expenses.
      </p>
      {form && (
        <Modal
          title={names[action]}
          close={() => {
            if (!busy) {
              setForm(null);
              setError("");
            }
          }}
        >
          <form onSubmit={save}>
            <ErrorBox error={error} />
            <FormFields
              kind={action}
              definitions={definitions}
              value={form}
              setValue={setForm}
              lookups={lookups}
            />
            {action === "expense" && (
              <p className="help-text">
                Either select an existing Equipment expense matching the service
                cost, or leave it blank and enter payment date/method to create
                one. This action records cash paid; it cannot be repeated.
              </p>
            )}
            {action === "assignment" && (
              <p className="help-text">
                The reservation must include the booking event date. Both
                boundary days are reserved.
              </p>
            )}
            <div className="modal-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title={detail.asset_code + " · " + detail.name}
          close={() => setDetail(null)}
        >
          <div className="document-summary">
            <strong>
              {detail.category} · {detail.availability}
            </strong>
            <span>
              {[detail.brand, detail.model].filter(Boolean).join(" · ") ||
                "No brand/model recorded"}
            </span>
            <span>Serial: {detail.serial_number || "—"}</span>
            <span>Condition: {detail.condition}</span>
            <span>
              Purchase date: {detail.purchase_date || "—"} · Cost:{" "}
              {money(detail.purchase_cost)}
            </span>
            <p>{detail.remarks}</p>
          </div>
          <h3 className="feature-section-title">Assignment history</h3>
          {detail.assignments.length ? (
            <Table
              rows={detail.assignments}
              keys={[
                "booking_id",
                "customer_name",
                "assigned_by_name",
                "assigned_date",
                "expected_return_date",
                "actual_return_date",
                "status",
              ]}
            />
          ) : (
            <p className="help-text">No assignments yet.</p>
          )}
          <h3 className="feature-section-title">Maintenance history</h3>
          {detail.maintenance.length ? (
            <Table
              rows={detail.maintenance}
              keys={[
                "maintenance_type",
                "service_date",
                "description",
                "service_provider",
                "maintenance_cost",
                "next_service_date",
                "status",
                "expense_id",
              ]}
            />
          ) : (
            <p className="help-text">No service records yet.</p>
          )}
          <div className="modal-footer">
            {detail.status !== "Retired" && (
              <>
                <button
                  onClick={() => {
                    setRetiring(detail);
                    setDetail(null);
                  }}
                >
                  Retire equipment
                </button>
                <button
                  className="primary"
                  onClick={() => start("equipment", detail)}
                >
                  Edit equipment
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
      {retiring && (
        <Modal
          title="Retire equipment?"
          close={() => {
            if (!busy) setRetiring(null);
          }}
        >
          <ErrorBox error={error} />
          <p>
            Retire {retiring.asset_code}? Its financial, assignment and
            maintenance history will remain. Equipment with open assignments or
            maintenance cannot be retired.
          </p>
          <div className="modal-footer">
            <button disabled={busy} onClick={() => setRetiring(null)}>
              Keep equipment
            </button>
            <button className="danger-button" disabled={busy} onClick={retire}>
              {busy ? "Retiring…" : "Confirm retirement"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
