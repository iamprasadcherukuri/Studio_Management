import React, { useEffect, useState } from "react";
import CustomerSearchSelect from "./components/CustomerSearchSelect";
import SettingsSection from "./components/SettingsSection";
import BookingInformation from "./components/BookingInformation";
import PaymentDiscountPreview from "./components/PaymentDiscountPreview";
import { formatMoney, subtractMoney } from "./services/money";
import MasterManagement from "./pages/MasterManagement";
import {
  NavLink,
  Routes,
  Route,
  useLocation,
  Navigate,
  useSearchParams,
} from "react-router-dom";
import {
  Camera,
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Images,
  Receipt,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Plus,
  Search,
  ArrowUpRight,
  ChevronRight,
  Menu,
  X,
  Download,
  Printer,
  Pencil,
  Trash2,
  Check,
  ShieldCheck,
  Moon,
  Sun,
} from "lucide-react";

import { api, message } from "./services/api";
import { csvCell } from "./services/csv";
import { previewBookingPrice } from "./services/booking-pricing";
import { FeatureSummary, ReceiptPdfButton } from "./components/DocumentTools";
const InvoicesPage = React.lazy(() =>
  import("./pages/Enhancements").then((module) => ({
    default: module.InvoicesPage,
  })),
);
const EquipmentPage = React.lazy(() =>
  import("./pages/Enhancements").then((module) => ({
    default: module.EquipmentPage,
  })),
);
const RevenueChart = React.lazy(() => import("./components/RevenueChart"));

const money = formatMoney;
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const date = (v) =>
  v
    ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "short", year: "numeric" },
      )
    : "—";
const stages = [
  "Pending",
  "Photo Selection",
  "Editing",
  "Design",
  "Customer Approval",
  "Printing",
  "Ready for Delivery",
  "Delivered",
];
const methods = ["Cash", "UPI", "Bank transfer", "Cheque"];
const nav = [
  ["Dashboard", "/", LayoutDashboard],
  ["Customers", "/customers", Users],
  ["Bookings", "/bookings", CalendarDays],
  ["Payments", "/payments", Wallet],
  ["Invoices", "/invoices", Receipt],
  ["Equipment", "/equipment", Camera],
  ["Albums", "/albums", Images],
  ["Expenses", "/expenses", Receipt],
  ["Reports", "/reports", ChartNoAxesCombined],
  ["Users", "/users", ShieldCheck],
  ["Settings", "/settings", Settings],
];
const labels = {
  dob: "Date of birth",
  customer_code: "Customer ID",
  name: "Name",
  mobile: "Mobile",
  email: "Email",
  customer_name: "Customer",
  event_type: "Event",
  event_date: "Event date",
  location: "Location",
  agreed_amount: "Agreed amount",
  paid: "Received",
  outstanding: "Outstanding",
  status: "Status",
  date: "Date",
  amount: "Amount",
  method: "Method",
  booking_id: "Booking",
  album_type: "Album type",
  size: "Size",
  pages: "Pages",
  expected_delivery: "Expected delivery",
  actual_delivery: "Delivered on",
  category: "Category",
  description: "Description",
  role: "Role",
  active: "Active",
};
const columns = {
  customers: ["customer_code", "name", "mobile", "email"],
  bookings: [
    "customer_name",
    "event_type",
    "event_date",
    "agreed_amount",
    "paid",
    "outstanding",
    "status",
  ],
  payments: [
    "receipt_number",
    "customer_name",
    "booking_id",
    "date",
    "amount",
    "reversed_amount",
    "net_amount",
    "method",
  ],
  albums: [
    "customer_name",
    "album_type",
    "size",
    "pages",
    "expected_delivery",
    "status",
  ],
  expenses: ["date", "category", "description", "amount", "method"],
  users: ["name", "email", "role", "active"],
  packages: ["name", "amount", "description"],
  staff: ["name", "mobile", "dob", "email", "address"],
};
const fields = {
  customers: [
    ["title", "Title", "text", false],
    ["gender", "Gender", "text", false],
    ["name", "Full name"],
    ["mobile", "Mobile number"],
    ["alternate_mobile", "Alternate mobile", "text", false],
    ["email", "Email address", "email", false],
    ["address", "Address", "textarea", false],
  ],
  bookings: [
    ["customer_id", "Customer", "customers"],
    ["event_type_id", "Event type", "event_types"],
    ["event_date", "Event date", "date"],
    ["location", "Event location"],
    ["package_id", "Package", "packages", false],
    ["total_amount", "Total booking amount (₹)", "number"],
    [
      "booking_discount_type",
      "Booking discount type",
      ["NONE", "PERCENTAGE", "FIXED"],
    ],
    ["booking_discount_value", "Booking discount value (% or ₹)", "number"],
    ["agreed_amount", "Final agreed amount (₹)", "number"],
    [
      "status",
      "Status",
      ["confirmed", "in progress", "completed", "cancelled"],
    ],
    ["staff_ids", "Assign staff", "multi", false],
    ["notes", "Notes", "textarea", false],
  ],
  payments: [
    ["booking_id", "Booking", "bookings"],
    ["date", "Payment date", "date"],
    ["amount", "Amount (₹)", "number"],
    [
      "payment_discount_type",
      "Additional discount type",
      ["NONE", "FIXED", "PERCENTAGE"],
    ],
    ["payment_discount_value", "Additional discount value (% or ₹)", "number"],
    ["method", "Payment method", [...methods, "Card"]],
    [
      "payment_type",
      "Payment type",
      ["Advance", "Partial", "Final", "Payment", "Installment"],
    ],
    ["reference", "Transaction / cheque reference", "text", false],
    ["remarks", "Remarks", "textarea", false],
  ],
  albums: [
    ["booking_id", "Booking", "bookings"],
    ["album_type", "Album type"],
    ["size", "Size"],
    ["pages", "Number of pages", "number"],
    ["printing_cost", "Printing cost estimate (₹)", "number"],
    ["expected_delivery", "Expected delivery", "date", false],
    ["status", "Workflow stage", stages],
    ["actual_delivery", "Actual delivery", "date", false],
    ["acknowledgement", "Delivery acknowledgement", "text", false],
    ["notes", "Notes", "textarea", false],
  ],
  expenses: [
    ["date", "Expense date", "date"],
    [
      "category",
      "Category",
      ["Salaries", "Equipment", "Printing", "Travel", "Other"],
    ],
    ["description", "Description"],
    ["amount", "Amount (₹)", "number"],
    ["method", "Payment method", methods],
    ["booking_id", "Related booking", "bookings", false],
    ["remarks", "Remarks", "textarea", false],
  ],
  users: [
    ["name", "Full name"],
    ["email", "Email address", "email"],
    [
      "password",
      "Temporary password (leave blank to generate)",
      "password",
      false,
    ],
    ["role", "Role", ["staff", "admin"]],
  ],
  packages: [
    ["name", "Package name"],
    ["package_type", "Package type", "text", false],
    ["amount", "Price (₹)", "number"],
    ["description", "Description", "textarea", false],
  ],
  staff: [
    ["name", "Staff name"],
    ["mobile", "Mobile", "text", false],
    ["dob", "Date of birth", "date"],
    ["email", "Email address", "email"],
    ["address", "Address", "textarea"],
  ],
  settings: [
    ["name", "Studio name"],
    ["phone", "Phone", "text", false],
    ["email", "Email", "email", false],
    ["address", "Studio address", "textarea", false],
    ["tagline", "Receipt tagline", "text", false],
    ["signatory_name", "Authorized signatory name", "text", false],
    ["signatory_title", "Signatory title", "text", false],
    ["receipt_footer", "Receipt footer message", "textarea", false],
  ],
};
function Badge({ children }) {
  return (
    <span
      className={
        "badge " +
        (["completed", "Delivered", "Ready for Delivery", "admin"].includes(
          children,
        )
          ? "green"
          : ["cancelled", "Pending"].includes(children)
            ? "amber"
            : "blue")
      }
    >
      {children}
    </span>
  );
}
function ErrorBox({ error }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : null;
}
function Empty({
  text = "No records yet",
  detail = "Your records will appear here as you add them.",
}) {
  return (
    <div className="empty">
      <Camera size={30} />
      <h3>{text}</h3>
      <p>{detail}</p>
    </div>
  );
}
function FormFields({
  kind,
  value,
  setValue,
  lookups = {},
  definitions = fields,
}) {
  return (
    <div className="form-grid">
      {definitions[kind].map(([key, label, type = "text", required = true]) => {
        if (key === "customer_id")
          return (
            <CustomerSearchSelect
              key={key}
              id={key}
              value={value[key]}
              required={required}
              onChange={(customerId) =>
                setValue((previous) => ({ ...previous, [key]: customerId }))
              }
            />
          );
        const entityCode = ({
          customers: { title: "CUSTOMER_TITLE", gender: "CUSTOMER_GENDER" },
          albums: { album_type: "ALBUM_TYPE", size: "ALBUM_SIZE" },
          payments: { method: "PAYMENT_TYPE" },
          expenses: { category: "EXPENSE_CATEGORY" },
          equipment: { category: "EQUIPMENT_CATEGORY" },
          packages: { package_type: "PACKAGE_TYPE" },
        }[kind] || {})[key];
        if (entityCode) {
          type = (lookups.master_values || [])
            .filter((v) => v.entity_code === entityCode)
            .map((v) => ({ id: v.stored_value, name: v.value_name }));
          if (value[key] && !type.some((x) => x.id === value[key]))
            type.push({ id: value[key], name: value[key] + " (saved value)" });
        }
        if (
          kind === "bookings" &&
          key === "event_type_id" &&
          value[key] &&
          !(lookups.event_types || []).some(
            (x) => String(x.id) === String(value[key]),
          )
        )
          lookups = {
            ...lookups,
            event_types: [
              ...(lookups.event_types || []),
              { id: value[key], name: value.event_type || "Saved event type" },
            ],
          };
        const common = {
          id: key,
          name: key,
          required,
          readOnly: kind === "bookings" && key === "agreed_amount",
          value: value[key] ?? "",
          onChange: (e) => {
            if (
              ["mobile", "alternate_mobile", "phone"].includes(key) &&
              !/^\d{0,10}$/.test(e.target.value)
            )
              return;
            const next = { ...value, [key]: e.target.value };
            if (
              key === "payment_discount_type" &&
              next.payment_discount_type === "NONE"
            )
              next.payment_discount_value = "0";
            if (key === "package_id") {
              const p = lookups.packages?.find(
                (p) => String(p.id) === e.target.value,
              );
              if (p) next.total_amount = p.amount;
            }
            if (
              kind === "bookings" &&
              [
                "package_id",
                "total_amount",
                "booking_discount_type",
                "booking_discount_value",
              ].includes(key)
            ) {
              if (
                key === "booking_discount_type" &&
                next.booking_discount_type === "NONE"
              )
                next.booking_discount_value = "0";
              setValue(previewBookingPrice(next));
            } else setValue(next);
          },
        };
        return (
          <label key={key} className={type === "textarea" ? "wide" : ""}>
            <span>
              {label}
              {required && <b> *</b>}
            </span>
            {type === "multi" ? (
              <select
                id={key}
                multiple
                value={(value[key] || []).map(String)}
                onChange={(e) =>
                  setValue({
                    ...value,
                    [key]: Array.from(e.target.selectedOptions, (o) =>
                      Number(o.value),
                    ),
                  })
                }
              >
                {lookups.staff?.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            ) : Array.isArray(type) ||
              [
                "customers",
                "event_types",
                "packages",
                "bookings",
                "equipment",
                "expenses",
              ].includes(type) ? (
              <select {...common}>
                <option value="">Select {label.toLowerCase()}</option>
                {(Array.isArray(type) ? type : lookups[type] || []).map((x) => (
                  <option key={x.id || x} value={x.id || x}>
                    {x.name || x}
                  </option>
                ))}
              </select>
            ) : type === "textarea" ? (
              <textarea {...common} rows={3} />
            ) : (
              <input
                {...common}
                type={
                  ["mobile", "alternate_mobile", "phone"].includes(key)
                    ? "tel"
                    : type
                }
                inputMode={
                  ["mobile", "alternate_mobile", "phone"].includes(key)
                    ? "numeric"
                    : undefined
                }
                pattern={
                  ["mobile", "alternate_mobile", "phone"].includes(key)
                    ? "[0-9]{10}"
                    : undefined
                }
                max={
                  ["dob", "actual_delivery"].includes(key) ? today() : undefined
                }
                min={type === "number" ? (key === "pages" ? 1 : 0) : undefined}
                step={
                  type === "number" ? (key === "pages" ? 1 : "0.01") : undefined
                }
                minLength={key === "password" ? 12 : undefined}
                maxLength={
                  ["mobile", "alternate_mobile", "phone"].includes(key)
                    ? 10
                    : key === "password"
                      ? 72
                      : undefined
                }
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
function Modal({ title, children, close }) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", fn);
    const previous = document.activeElement;
    setTimeout(
      () =>
        document
          .querySelector(
            '[role="dialog"] input,[role="dialog"] select,[role="dialog"] button',
          )
          ?.focus(),
      0,
    );
    return () => {
      document.removeEventListener("keydown", fn);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const nodes = e.currentTarget.querySelectorAll(
              "button,input,select,textarea,a[href]",
            );
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <small>STUDIO WORKSPACE</small>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Login({ onLogin }) {
  const [initialized, setInitialized] = useState(null),
    [form, setForm] = useState({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const check = () =>
    api
      .get("/auth/status")
      .then((r) => setInitialized(r.data.initialized))
      .catch((e) => setError(message(e)));
  useEffect(() => {
    check();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!initialized) {
        await api.post("/auth/setup", form);
        setInitialized(true);
        setForm({});
      } else {
        const { data } = await api.post("/auth/login", form);
        sessionStorage.setItem("studio-token", data.token);
        onLogin(data.user);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <Camera /> studio<span> /</span>
        </div>
        <div>
          <span className="eyebrow">MORE TIME BEHIND THE LENS</span>
          <h1>
            Beautiful moments.
            <br />A beautifully
            <br />
            organized studio.
          </h1>
          <p>
            From the first booking to the final album,
            <br />
            keep every detail in focus.
          </p>
        </div>
        <small>YOUR STUDIO. ALL TOGETHER.</small>
      </section>
      <main>
        <form onSubmit={submit}>
          <div className="logo-box">
            <Camera />
          </div>
          <h1>
            {initialized === false ? "Make it your studio" : "Welcome back"}
          </h1>
          <p>
            {initialized === false
              ? "Create your first administrator to get started."
              : "Sign in to your studio workspace."}
          </p>
          <ErrorBox error={error} />
          {initialized === null ? (
            <button type="button" onClick={check}>
              Retry connection
            </button>
          ) : (
            <>
              {!initialized && (
                <>
                  <label>
                    Your name
                    <input
                      required
                      value={form.name || ""}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Setup token
                    <input
                      required
                      type="password"
                      value={form.setup_token || ""}
                      onChange={(e) =>
                        setForm({ ...form, setup_token: e.target.value })
                      }
                    />
                  </label>
                  <small>
                    Use SETUP_TOKEN from backend/.env on this computer.
                  </small>
                </>
              )}
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={form.email || ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    initialized ? "current-password" : "new-password"
                  }
                  minLength={initialized ? 1 : 12}
                  maxLength={72}
                  required
                  value={form.password || ""}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </label>
              <button disabled={busy} className="primary full">
                {busy
                  ? "Please wait…"
                  : initialized
                    ? "Sign in to workspace"
                    : "Create administrator"}
                <ArrowUpRight size={18} />
              </button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
function FirstLoginPassword({ user, onDone }) {
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (form.new_password !== form.confirm_password) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", form);
      onDone();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="password-change-page">
      <section className="card">
        <div className="logo-box">
          <ShieldCheck />
        </div>
        <h1>Set your own password</h1>
        <p>
          Welcome, {user.name}. Replace your temporary password before opening
          the workspace.
        </p>
        <form onSubmit={submit}>
          <ErrorBox error={error} />
          <label>
            Temporary password
            <input
              required
              autoComplete="current-password"
              type="password"
              value={form.current_password}
              onChange={(e) =>
                setForm({ ...form, current_password: e.target.value })
              }
            />
          </label>
          <label>
            New password
            <input
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              type="password"
              value={form.new_password}
              onChange={(e) =>
                setForm({ ...form, new_password: e.target.value })
              }
            />
          </label>
          <label>
            Confirm new password
            <input
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              type="password"
              value={form.confirm_password}
              onChange={(e) =>
                setForm({ ...form, confirm_password: e.target.value })
              }
            />
          </label>
          <p className="help-text">
            Use at least 12 characters and choose a different password. After
            saving, sign in with your new password.
          </p>
          <button className="primary full" disabled={busy}>
            {busy ? "Saving…" : "Change password and sign in"}
          </button>
          <button
            type="button"
            className="full"
            disabled={busy}
            onClick={onDone}
          >
            Back to sign in
          </button>
        </form>
      </section>
    </div>
  );
}
export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("studio-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("studio-theme", theme);
    } catch {
      /* Theme still works when browser storage is unavailable. */
    }
  }, [theme]);
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [settings, setSettings] = useState({ name: "The Photo Studio" });
  const location = useLocation();
  useEffect(() => {
    if (sessionStorage.getItem("studio-token"))
      api
        .get("/auth/me")
        .then((r) => setUser(r.data))
        .catch((e) => setError(message(e)))
        .finally(() => setLoading(false));
    else setLoading(false);
  }, []);
  useEffect(() => {
    if (user)
      api
        .get("/settings")
        .then((r) => setSettings(r.data))
        .catch(() => {});
  }, [user]);
  useEffect(() => setOpen(false), [location]);
  if (loading) return <div className="boot">Opening your studio…</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.must_change_password)
    return (
      <FirstLoginPassword
        user={user}
        onDone={() => {
          sessionStorage.removeItem("studio-token");
          setUser(null);
          setOpen(false);
        }}
      />
    );
  const isAdmin = user.role === "admin";
  const allowed = nav.filter(
    ([name]) =>
      isAdmin ||
      ["Dashboard", "Customers", "Bookings", "Albums"].includes(name),
  );
  const title =
    nav.find(([, path]) => path === location.pathname)?.[0] || "Dashboard";
  return (
    <div className="app">
      <aside className={open ? "open" : ""}>
        <NavLink to="/" className="brand">
          <div className="logo-box">
            <Camera size={23} />
          </div>
          <div>
            studio<span> /</span>
            <small>MANAGEMENT SUITE</small>
          </div>
        </NavLink>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {allowed.map(([name, path, Icon]) => (
            <NavLink key={name} to={path} end={path === "/"}>
              <Icon size={19} />
              <span>{name}</span>
              {name === "Dashboard" && <i />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="tiny-icon">
            <Camera size={18} />
          </div>
          <strong>Every detail, in focus.</strong>
          <p>
            A little less admin.
            <br />A lot more creating.
          </p>
        </div>
        <div className="profile">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{isAdmin ? "Studio administrator" : "Studio staff"}</small>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            className="icon-button"
            onClick={() => {
              sessionStorage.removeItem("studio-token");
              setOpen(false);
              setUser(null);
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="studio-dot" />
            <span className="studio-name">{settings.name}</span>
            <button
              className="theme-toggle"
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              aria-pressed={theme === "dark"}
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
            >
              {theme === "dark" ? (
                <Sun size={19} aria-hidden="true" />
              ) : (
                <Moon size={19} aria-hidden="true" />
              )}
            </button>
          </div>
        </header>
        <main className="content">
          <ErrorBox error={error} />
          <React.Suspense
            fallback={<div className="loading">Loading page?</div>}
          >
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              {[
                "customers",
                "bookings",
                "albums",
                ...(isAdmin ? ["payments", "expenses", "users"] : []),
              ].map((kind) => (
                <Route
                  key={kind}
                  path={"/" + kind}
                  element={
                    <Records
                      key={kind}
                      kind={kind}
                      user={user}
                      settings={settings}
                    />
                  }
                />
              ))}
              {isAdmin && (
                <>
                  <Route
                    path="/invoices"
                    element={<InvoicesPage ui={featureUi} />}
                  />
                  <Route
                    path="/equipment"
                    element={<EquipmentPage ui={featureUi} />}
                  />
                  <Route path="/reports" element={<Reports />} />
                  <Route
                    path="/settings"
                    element={
                      <StudioSettings
                        settings={settings}
                        onSave={setSettings}
                        user={user}
                      />
                    }
                  />
                </>
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </React.Suspense>
          <footer className="page-footer">
            <span>{settings.name}</span>
            <span>Made for moments. Built for your business.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Heading({
  eyebrow = "YOUR STUDIO, AT A GLANCE",
  title,
  subtitle,
  children,
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Dashboard({ user }) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = () => {
    setError("");
    api
      .get("/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(message(e)));
  };
  useEffect(load, []);
  if (!data)
    return (
      <>
        <Heading
          title="Your studio overview"
          subtitle="A clear view of what’s happening."
        />
        <ErrorBox error={error} />
        {error ? (
          <button onClick={load}>Try again</button>
        ) : (
          <div className="loading">Loading your studio overview…</div>
        )}
      </>
    );
  const m = data.metrics;
  const cards = [
    ["Total customers", m.customers, Users, "Your growing community"],
    [
      "Total bookings",
      m.bookings,
      CalendarDays,
      "Every moment on the calendar",
    ],
    [
      "Payments received",
      money(m.received),
      Wallet,
      "Net receipts after reversals",
    ],
    [
      "Pending payments",
      money(m.pending),
      Receipt,
      "Outstanding booking balance",
    ],
  ];
  return (
    <>
      <Heading
        title={`A little clarity. A lot of possibility.`}
        subtitle={`Welcome back, ${user.name.split(" ")[0]}. Here’s how your studio is doing.`}
      >
        <div className="date-pill">
          <CalendarDays size={16} />
          {date(today())}
        </div>
        {user.role === "admin" && (
          <NavLink className="primary" to="/bookings?new=1">
            <Plus size={17} />
            New booking
          </NavLink>
        )}
      </Heading>
      <div className="stat-grid">
        {cards.map(([label, value, Icon, caption], i) => (
          <article className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <div className={"stat-icon tone-" + i}>
                <Icon size={19} />
              </div>
            </div>
            <h2>{value}</h2>
            <small>
              <span className="mini-dot" />
              {caption}
            </small>
          </article>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="card chart-card">
          <div className="card-heading">
            <div>
              <h2>Money in, money out</h2>
              <p>Your studio’s cash flow over the last 6 months</p>
            </div>
            <span className="subtle-tag">Monthly overview</span>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              Payments received
            </span>
            <span>
              <i />
              Expenses paid
            </span>
          </div>
          <div className="chart">
            <React.Suspense
              fallback={<div className="loading">Loading chart?</div>}
            >
              <RevenueChart months={data.months} />
            </React.Suspense>
          </div>
          <div className="chart-bottom">
            <span>
              Net cash balance{" "}
              <strong>
                {money(m.cash_balance ?? subtractMoney(m.received, m.expenses))}
              </strong>
            </span>
            <span>All time · receipts − expenses</span>
          </div>
        </section>
        <section className="card upcoming">
          <div className="card-heading">
            <div>
              <h2>Coming into focus</h2>
              <p>Your next scheduled events</p>
            </div>
            <CalendarDays size={20} />
          </div>
          {data.bookings.length ? (
            data.bookings.map((b) => (
              <NavLink
                className="event-row"
                key={b.id}
                to={`/bookings?booking=${b.id}`}
                aria-label={`View booking for ${b.customer_name}`}
              >
                <div className="date-square">
                  <strong>{new Date(b.event_date).getDate()}</strong>
                  <small>
                    {new Date(b.event_date).toLocaleString("en", {
                      month: "short",
                    })}
                  </small>
                </div>
                <div>
                  <strong>{b.customer_name}</strong>
                  <p>
                    {b.event_type} · {b.location}
                  </p>
                </div>
                <ChevronRight size={15} />
              </NavLink>
            ))
          ) : (
            <Empty
              text="A little room to create"
              detail="Upcoming bookings will appear here."
            />
          )}
          <NavLink className="card-link" to="/bookings">
            View all bookings <ArrowUpRight size={16} />
          </NavLink>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Recent bookings</h2>
              <p>The latest additions to your calendar</p>
            </div>
            <NavLink className="text-link" to="/bookings">
              View all <ArrowUpRight size={14} />
            </NavLink>
          </div>
          {data.recent.length ? (
            <Table
              rows={data.recent}
              keys={["customer_name", "event_date", "agreed_amount", "status"]}
            />
          ) : (
            <Empty
              text="Your next chapter starts here"
              detail="Add a customer and create your first booking."
            />
          )}
        </section>
        <section className="card delivery">
          <div className="card-heading">
            <div>
              <h2>From screen to keepsake</h2>
              <p>Album delivery progress</p>
            </div>
            <Images size={20} />
          </div>
          <div className="delivery-count">
            <strong>{m.pending_albums}</strong>
            <span>albums in the making</span>
          </div>
          {[
            "Pending",
            "Photo Selection",
            "Editing",
            "Design",
            "Customer Approval",
            "Printing",
            "Ready for Delivery",
          ].map((s, i) => {
            const n = data.albums.find((x) => x.status === s)?.count || 0;
            return (
              <div className="progress-row" key={s}>
                <div>
                  <span>{s}</span>
                  <strong>{n}</strong>
                </div>
                <div className="track">
                  <i
                    style={{
                      width: `${Math.min(100, (n / Math.max(1, Number(m.pending_albums))) * 100)}%`,
                      background: [
                        "#86adf7",
                        "#729ef4",
                        "#6190ee",
                        "#5083e3",
                        "#3e77d9",
                        "#2b69cf",
                      ][i],
                    }}
                  />
                </div>
              </div>
            );
          })}
          <NavLink className="card-link" to="/albums">
            Manage albums <ArrowUpRight size={16} />
          </NavLink>
        </section>
      </div>
      {user.role === "admin" && <FeatureSummary ui={featureUi} />}
      <div className="mini-stats">
        <span>
          <Receipt size={18} />
          Total expenses <strong>{money(m.expenses)}</strong>
        </span>
        <span>
          <Wallet size={18} />
          Net cash balance{" "}
          <strong>
            {money(m.cash_balance ?? subtractMoney(m.received, m.expenses))}
          </strong>
        </span>
        <span>
          <Images size={18} />
          Pending albums <strong>{m.pending_albums}</strong>
        </span>
      </div>
    </>
  );
}
function cell(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (["status", "role", "payment_status", "availability"].includes(key))
    return <Badge>{value}</Badge>;
  if (key === "active") return value ? "Yes" : "No";
  if (
    [
      "amount",
      "agreed_amount",
      "paid",
      "outstanding",
      "printing_cost",
      "received",
      "booked_amount",
      "receipts",
      "reversed_amount",
      "net_amount",
      "total_amount",
      "paid_amount",
      "balance_amount",
      "unit_price",
      "line_total",
      "purchase_cost",
      "maintenance_cost",
    ].includes(key)
  )
    return money(value);
  if (
    key === "dob" ||
    key.includes("date") ||
    key.includes("delivery") ||
    key === "created_at"
  )
    return date(value);
  if (key === "booking_id") return "#" + value;
  return String(value);
}
function Table({ rows, keys, actions }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{labels[k] || k.replaceAll("_", " ")}</th>
            ))}
            {actions && <th className="actions-heading">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {keys.map((k, j) => (
                <td key={k} className={j === 0 ? "first-cell" : ""}>
                  {cell(k, r[k])}
                </td>
              ))}
              {actions && (
                <td>
                  <div className="row-actions">{actions(r)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const featureUi = {
  Heading,
  Modal,
  FormFields,
  Table,
  Empty,
  ErrorBox,
  Badge,
  money,
  date,
  today,
};
function Records({
  kind,
  user,
  settings,
  embedded = false,
  sectioned = false,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const bookingId = kind === "bookings" ? searchParams.get("booking") : null;
  const [rows, setRows] = useState([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState(null),
    [value, setValue] = useState({}),
    [saving, setSaving] = useState(false),
    [lookups, setLookups] = useState({}),
    [detail, setDetail] = useState(null),
    [credentials, setCredentials] = useState(null),
    [resetting, setResetting] = useState(null),
    [adminPassword, setAdminPassword] = useState(""),
    [reversing, setReversing] = useState(null),
    [reversalForm, setReversalForm] = useState({}),
    [reversalRows, setReversalRows] = useState([]),
    [confirm, setConfirm] = useState(null);
  const title = kind[0].toUpperCase() + kind.slice(1);
  const singular = {
    customers: "customer",
    bookings: "booking",
    payments: "payment",
    albums: "album",
    expenses: "expense",
    users: "user",
    packages: "package",
    staff: "staff member",
  }[kind];
  const load = () => {
    setLoading(true);
    setError("");
    api
      .get("/" + kind, {
        params: {
          search,
          page,
          limit: 20,
          status: kind !== "expenses" ? filter : undefined,
          category: kind === "expenses" ? filter : undefined,
          from,
          to,
        },
      })
      .then((r) => {
        setRows(r.data.data);
        setTotal(r.data.total ?? r.data.data.length);
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [kind, page, search, filter, from, to]);
  const fetchLookups = () =>
    api
      .get("/lookups")
      .then((r) => setLookups(r.data))
      .catch((e) => setError(message(e)));
  useEffect(() => {
    if (kind === "expenses") fetchLookups();
  }, [kind]);
  function start(row) {
    setError("");
    setNotice("");
    setValue(
      row
        ? {
            ...row,
            ...(kind === "bookings"
              ? {
                  booking_discount_type:
                    row.booking_discount_type ??
                    (Number(row.payment_discounts) > 0
                      ? Number(row.booking_discount_amount) > 0
                        ? "FIXED"
                        : "NONE"
                      : row.discount_type),
                  booking_discount_value:
                    row.booking_discount_value ??
                    (Number(row.payment_discounts) > 0
                      ? row.booking_discount_amount
                      : row.discount_value),
                }
              : {}),
            ...Object.fromEntries(
              Object.entries(row)
                .filter(
                  ([k, v]) =>
                    v && (k.includes("date") || k.includes("delivery")),
                )
                .map(([k, v]) => [k, String(v).slice(0, 10)]),
            ),
          }
        : {
            date: today(),
            status: kind === "albums" ? "Pending" : "confirmed",
            printing_cost: 0,
            role: "staff",
            idempotency_key: crypto.randomUUID(),
            payment_type: "Advance",
            payment_discount_type: "NONE",
            payment_discount_value: "0",
            total_amount: "",
            discount_type: "NONE",
            discount_value: "0",
            booking_discount_type: "NONE",
            booking_discount_value: "0",
            discount_amount: 0,
            staff_ids: [],
          },
    );
    setEditing(row || {});
    fetchLookups();
  }
  const location = useLocation();
  useEffect(() => {
    if (new URLSearchParams(location.search).get("new")) start();
  }, []);
  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      let receiptNumber;
      if (editing.id) await api.put(`/${kind}/${editing.id}`, value);
      else {
        const { data } = await api.post("/" + kind, value);
        if (kind === "users") setCredentials(data);
        if (kind === "payments") receiptNumber = data.receipt_number;
      }
      setEditing(null);
      setNotice(
        receiptNumber
          ? `Receipt ${receiptNumber} saved. Payment recorded once.`
          : `${singular[0].toUpperCase() + singular.slice(1)} saved successfully.`,
      );
      load();
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setSaving(true);
    try {
      await api.delete(`/${kind}/${confirm.id}`);
      setConfirm(null);
      setNotice("Record deleted.");
      load();
    } catch (e) {
      setError(message(e));
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  }
  async function history(r) {
    setError("");
    try {
      const { data } = await api.get(`/customers/${r.id}/history`);
      setDetail({ customer: r, history: data });
    } catch (e) {
      setError(message(e));
    }
  }
  const canDelete =
    user.role === "admin" &&
    ["customers", "expenses", "packages", "staff"].includes(kind);
  const dateFilters = ["bookings", "payments", "expenses", "albums"].includes(
    kind,
  );
  return (
    <>
      {bookingId && (
        <BookingInformation
          id={bookingId}
          close={() =>
            setSearchParams(
              (previous) => {
                const next = new URLSearchParams(previous);
                next.delete("booking");
                return next;
              },
              { replace: true },
            )
          }
          ui={{ Modal, ErrorBox, money, date }}
        />
      )}
      {!embedded && (
        <Heading
          eyebrow="KEEP EVERY DETAIL IN FOCUS"
          title={title}
          subtitle={
            {
              customers: "The people behind every story.",
              bookings: "Every event, every detail, all together.",
              payments: "Record receipts and keep balances clear.",
              albums: "Turn beautiful moments into lasting keepsakes.",
              expenses: "A clear record of where your money goes.",
              users: "The people who make your studio work.",
            }[kind]
          }
        >
          <button className="primary" onClick={() => start()}>
            <Plus size={17} />
            Add {singular}
          </button>
        </Heading>
      )}
      {embedded && (
        <div className="card-heading">
          {!sectioned && <h2>{title}</h2>}
          <button onClick={() => start()}>
            <Plus size={16} />
            Add {singular}
          </button>
        </div>
      )}
      {editing === null && !resetting && !reversing && (
        <ErrorBox error={error} />
      )}{" "}
      {notice && (
        <div className="notice success" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      <section className={embedded ? "" : "card records-card"}>
        <div className="toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label={`Search ${kind}`}
              placeholder={`Search ${kind}…`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {["bookings", "albums", "expenses"].includes(kind) && (
            <select
              aria-label="Filter by status or category"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">
                All {kind === "expenses" ? "categories" : "statuses"}
              </option>
              {(kind === "albums"
                ? stages
                : kind === "bookings"
                  ? ["confirmed", "in progress", "completed", "cancelled"]
                  : (lookups.master_values || [])
                      .filter((v) => v.entity_code === "EXPENSE_CATEGORY")
                      .map((v) => ({ id: v.stored_value, name: v.value_name }))
              ).map((x) => (
                <option key={x.id || x} value={x.id || x}>
                  {x.name || x}
                </option>
              ))}
            </select>
          )}
          {dateFilters && (
            <>
              <label className="inline-label">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="inline-label">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </>
          )}
          <span className="record-count">{total} records</span>
        </div>
        {loading ? (
          <div className="loading">Loading {kind}…</div>
        ) : rows.length ? (
          <Table
            rows={rows}
            keys={columns[kind]}
            actions={(r) => (
              <>
                {kind === "customers" && (
                  <button className="text-link" onClick={() => history(r)}>
                    History
                  </button>
                )}
                {kind === "payments" ? (
                  <>
                    <button
                      className="text-link"
                      onClick={async () => {
                        setError("");
                        try {
                          const { data } = await api.get(
                            `/payments/${r.id}/reversals`,
                          );
                          setReversalRows(data.data);
                          setReversalForm({
                            date: today(),
                            amount: r.net_amount,
                            reason: "",
                            idempotency_key: crypto.randomUUID(),
                          });
                          setReversing(r);
                        } catch (error) {
                          setError(message(error));
                        }
                      }}
                    >
                      Reverse / history
                    </button>
                    <ReceiptPdfButton payment={r} ui={featureUi} />
                    <ReceiptPdfButton
                      payment={r}
                      ui={featureUi}
                      label="View receipt"
                      printIcon
                    />
                  </>
                ) : kind === "users" ? (
                  <>
                    <button
                      className="text-link"
                      disabled={r.id === user.id || !r.active}
                      onClick={() => {
                        setResetting(r);
                        setAdminPassword("");
                        setError("");
                      }}
                    >
                      Reset password
                    </button>
                    <button
                      className="text-link"
                      disabled={r.id === user.id}
                      onClick={async () => {
                        try {
                          await api.patch(`/users/${r.id}`, {
                            active: !r.active,
                          });
                          load();
                        } catch (e) {
                          setError(message(e));
                        }
                      }}
                    >
                      {r.active ? "Disable" : "Enable"}
                    </button>
                  </>
                ) : (
                  <button
                    className="icon-button"
                    aria-label={`Edit ${singular}`}
                    onClick={() => start(r)}
                  >
                    <Pencil size={15} />
                  </button>
                )}
                {canDelete && (
                  <button
                    className="icon-button danger"
                    aria-label={`Delete ${singular}`}
                    onClick={() => setConfirm(r)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </>
            )}
          />
        ) : (
          <Empty
            text={`No ${kind} found`}
            detail={
              search || filter
                ? "Try another search or filter."
                : `Add your first ${singular} to get started.`
            }
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
              disabled={page * 20 >= total || loading || kind === "users"}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {kind === "albums" && (
        <p className="help-text">
          Printing cost is an estimate. Record the paid cost in Expenses to
          include it in cash totals. Marking an album Delivered requires a
          delivery date and acknowledgement.
        </p>
      )}
      {kind === "payments" && (
        <p className="help-text">
          Offline receipts only. Payments are permanent financial records.
          Advances and installments are recorded here.
        </p>
      )}
      {editing !== null && (
        <Modal
          title={`${editing.id ? "Edit" : "Add"} ${singular}`}
          close={() => {
            if (!saving) {
              setEditing(null);
              setError("");
            }
          }}
        >
          <form onSubmit={save}>
            <ErrorBox error={error} />
            <FormFields
              kind={kind}
              value={value}
              setValue={setValue}
              lookups={lookups}
            />
            {kind === "bookings" && (
              <p className="help-text">
                Record advances separately in Payments after saving this
                booking. Enter the original total and choose a percentage or
                fixed discount. The final agreed amount is calculated once and
                remains the booking's payment limit. Granted payment discounts
                are preserved separately and are never removed by this booking
                discount.
              </p>
            )}
            {kind === "payments" && (
              <PaymentDiscountPreview value={value} money={money} />
            )}
            <div className="modal-footer">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving
                  ? "Saving…"
                  : kind === "payments"
                    ? "Save receipt"
                    : `Save ${singular}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reversing && (
        <Modal
          title="Payment reversals"
          close={() => {
            if (!saving) {
              setReversing(null);
              setError("");
            }
          }}
        >
          <ErrorBox error={error} />
          <p>
            Payment #{reversing.id}: original {money(reversing.amount)},
            reversed {money(reversing.reversed_amount)}, remaining{" "}
            {money(reversing.net_amount)}.
          </p>
          <p className="help-text">
            A reversal records money refunded or an incorrect receipt removed.
            It reduces net receipts and restores the booking balance. The
            original payment remains unchanged.
          </p>
          {Number(reversing.net_amount) > 0 && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (saving) return;
                setSaving(true);
                setError("");
                try {
                  await api.post(
                    `/payments/${reversing.id}/reversals`,
                    reversalForm,
                  );
                  setReversing(null);
                  setNotice(
                    "Payment reversal recorded. Net receipts and outstanding balances are updated.",
                  );
                  load();
                } catch (error) {
                  setError(message(error));
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div className="form-grid feature-section-title">
                <label>
                  Reversal date
                  <input
                    type="date"
                    required
                    min={String(reversing.date).slice(0, 10)}
                    max={today()}
                    value={reversalForm.date}
                    onChange={(event) =>
                      setReversalForm({
                        ...reversalForm,
                        date: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Reversal amount (₹)
                  <input
                    type="number"
                    required
                    min="0.01"
                    max={reversing.net_amount}
                    step="0.01"
                    value={reversalForm.amount}
                    onChange={(event) =>
                      setReversalForm({
                        ...reversalForm,
                        amount: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="wide">
                  Reason
                  <textarea
                    required
                    minLength={3}
                    maxLength={1000}
                    value={reversalForm.reason}
                    onChange={(event) =>
                      setReversalForm({
                        ...reversalForm,
                        reason: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setReversing(null)}
                >
                  Cancel
                </button>
                <button className="danger-button" disabled={saving}>
                  {saving ? "Recording…" : "Confirm reversal"}
                </button>
              </div>
            </form>
          )}
          <h3 className="feature-section-title">Reversal history</h3>
          {reversalRows.length ? (
            <Table
              rows={reversalRows}
              keys={["date", "amount", "reason", "created_by_name"]}
            />
          ) : (
            <p className="help-text">No reversals recorded.</p>
          )}
        </Modal>
      )}
      {credentials && (
        <Modal
          title={credentials.reset ? "Password reset" : "User created"}
          close={() => setCredentials(null)}
        >
          <p>
            Share these details securely with the user. They must change their
            password at first login.
          </p>
          <div className="temporary-credentials">
            <strong>{credentials.name}</strong>
            <span>{credentials.email}</span>
            <label>
              Temporary password
              <input
                readOnly
                value={credentials.temporary_password}
                onFocus={(e) => e.target.select()}
              />
            </label>
          </div>
          <p className="help-text">
            This password is displayed only now. It cannot be retrieved later.
          </p>
          <div className="modal-footer">
            <button className="primary" onClick={() => setCredentials(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {resetting && (
        <Modal
          title="Reset user password?"
          close={() => {
            if (!saving) {
              setResetting(null);
              setAdminPassword("");
              setError("");
            }
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (saving) return;
              setSaving(true);
              setError("");
              try {
                const { data } = await api.post(
                  `/users/${resetting.id}/reset-password`,
                  { current_password: adminPassword },
                );
                setResetting(null);
                setAdminPassword("");
                setCredentials(data);
                setNotice(
                  "Password reset. Previous sessions are revoked and a password change is required.",
                );
                load();
              } catch (error) {
                setError(message(error));
              } finally {
                setSaving(false);
              }
            }}
          >
            <ErrorBox error={error} />
            <p>
              Reset the password for {resetting.name} ({resetting.email})? Their
              active sessions will end. Share the new temporary password
              securely.
            </p>
            <label className="feature-section-title">
              Your administrator password
              <input
                required
                type="password"
                autoComplete="current-password"
                maxLength={72}
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
              />
            </label>
            <div className="modal-footer">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setResetting(null);
                  setAdminPassword("");
                }}
              >
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving ? "Resetting…" : "Confirm password reset"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title={`Delete ${singular}?`} close={() => setConfirm(null)}>
          <p>
            This permanently removes the record. Linked records cannot be
            deleted.
          </p>
          <div className="modal-footer">
            <button onClick={() => setConfirm(null)}>Keep record</button>
            <button
              className="danger-button"
              disabled={saving}
              onClick={remove}
            >
              {saving ? "Deleting…" : "Delete record"}
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal
          title={
            detail.receipt
              ? "Payment receipt"
              : `${detail.customer.name} · booking history`
          }
          close={() => setDetail(null)}
        >
          {detail.receipt ? (
            <div className="receipt-print">
              <div className="receipt-brand">
                <Camera />
                <h2>{settings.name}</h2>
                <p>{settings.address}</p>
                <p>
                  {settings.phone} {settings.email}
                </p>
              </div>
              <h2>PAYMENT RECEIPT</h2>
              <div className="receipt-meta">
                <span>
                  Receipt #PAY-{String(detail.receipt.id).padStart(5, "0")}
                </span>
                <span>{date(detail.receipt.date)}</span>
              </div>
              <dl>
                {[
                  ["Received from", detail.receipt.customer_name],
                  ["Booking", `#${detail.receipt.booking_id}`],
                  ["Payment method", detail.receipt.method],
                  ["Reference", detail.receipt.reference || "—"],
                  ["Amount received", money(detail.receipt.amount)],
                  ["Amount reversed", money(detail.receipt.reversed_amount)],
                  ["Net retained", money(detail.receipt.net_amount)],
                  ["Remarks", detail.receipt.remarks || "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p>Thank you for letting us be part of your story.</p>
              <button
                className="primary no-print"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                Print receipt
              </button>
            </div>
          ) : detail.history.length ? (
            <>
              <Table
                rows={detail.history}
                keys={[
                  "id",
                  "event_type",
                  "event_date",
                  "agreed_amount",
                  "paid",
                  "outstanding",
                  "status",
                ]}
              />
              <p className="help-text">
                Payments and outstanding balances are calculated from the
                payment ledger.
              </p>
            </>
          ) : (
            <Empty text="No bookings yet" />
          )}
        </Modal>
      )}
    </>
  );
}
function Reports() {
  const [type, setType] = useState("summary"),
    [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [data, setData] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    api
      .get("/reports", { params: { type, from, to } })
      .then((r) => {
        if (active) setData(r.data.data);
      })
      .catch((e) => {
        if (active) {
          setData([]);
          setError(message(e));
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [type, from, to]);
  function exportCSV() {
    const keys = Object.keys(data[0]);
    const escape = csvCell;
    const csv =
      "\uFEFF" +
      [keys, ...data.map((r) => keys.map((k) => r[k]))]
        .map((row) => row.map(escape).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `studio-${type}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Heading
        eyebrow="SEE THE BIGGER PICTURE"
        title="Reports & insights"
        subtitle="Clear numbers. Confident decisions."
      >
        <button
          className="primary"
          disabled={!data.length || busy || !!error}
          onClick={exportCSV}
        >
          <Download size={17} />
          Export CSV
        </button>
      </Heading>
      <section className="card">
        <div className="toolbar">
          <label className="inline-label">
            Report
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries({
                summary: "Cash summary",
                daily: "Daily receipts",
                monthly: "Monthly receipts",
                yearly: "Yearly receipts",
                receipts: "Payment receipts",
                bookings: "Bookings",
                outstanding: "Outstanding balances",
                expenses: "Expenses",
                categories: "Expense categories",
                albums: "Album deliveries",
                customers: "Customer history",
              }).map(([v, n]) => (
                <option value={v} key={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-label">
            From
            <input
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="inline-label">
            To
            <input
              type="date"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <div className="preset-buttons">
            {["Month", "Year", "All time"].map((p) => (
              <button
                key={p}
                onClick={() => {
                  setTo(today());
                  setFrom(
                    p === "Month"
                      ? today().slice(0, 7) + "-01"
                      : p === "Year"
                        ? today().slice(0, 4) + "-01-01"
                        : "2000-01-01",
                  );
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <ErrorBox error={error} />
        {busy ? (
          <div className="loading">Preparing report…</div>
        ) : data.length ? (
          <Table rows={data} keys={Object.keys(data[0])} />
        ) : (
          <Empty
            text="No data in this period"
            detail="Choose another date range or add records to your studio."
          />
        )}
      </section>
      <p className="help-text">
        Net cash balance = payments received − expenses paid in the selected
        period. It is a cash measure, not accounting profit. Bookings and
        outstanding reports use event dates; deliveries use actual delivery, or
        expected delivery when undelivered.
      </p>
    </>
  );
}
function StudioSettings({ settings, onSave, user }) {
  const [value, setValue] = useState(settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.put("/settings", value);
      onSave(data);
      setNotice("Studio details saved.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Studio settings"
        subtitle="The details that make this workspace yours."
      />
      <SettingsSection title="Studio Profile">
        <p className="help-text">
          These details appear on your payment receipts.
        </p>
        <form onSubmit={save}>
          <ErrorBox error={error} />
          {notice && <div className="notice success">{notice}</div>}
          <FormFields kind="settings" value={value} setValue={setValue} />
          <div className="feature-section-title">
            <label>
              Receipt studio logo (PNG/JPEG, up to 100 KB)
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (
                    file.size > 102400 ||
                    !["image/png", "image/jpeg"].includes(file.type)
                  ) {
                    setError("Choose a PNG or JPEG logo up to 100 KB");
                    event.target.value = "";
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setValue((current) => ({
                      ...current,
                      logo_data_url: String(reader.result),
                    }));
                    setError("");
                  };
                  reader.onerror = () =>
                    setError("Unable to read the selected image");
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {value.logo_data_url && (
              <div className="receipt-logo-upload">
                <img src={value.logo_data_url} alt="Studio receipt logo" />
                <button
                  type="button"
                  onClick={() => setValue({ ...value, logo_data_url: null })}
                >
                  Remove logo
                </button>
              </div>
            )}
            <p className="help-text">
              Logo dimensions must be at most 2048 × 2048. Existing issued
              receipts retain their original branding. Signatory text appears
              with a blank signature line.
            </p>
          </div>
          <div className="modal-footer">
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save studio details"}
            </button>
          </div>
        </form>
      </SettingsSection>
      <SettingsSection title="Master Management">
        <MasterManagement ui={{ Modal, ErrorBox }} embedded />
      </SettingsSection>
      <SettingsSection title="Packages">
        <Records
          kind="packages"
          user={user}
          settings={settings}
          embedded
          sectioned
        />
      </SettingsSection>
      <SettingsSection title="Staff">
        <Records
          kind="staff"
          user={user}
          settings={settings}
          embedded
          sectioned
        />
      </SettingsSection>
      <div className="permission-note" role="note">
        <ShieldCheck />
        <div>
          <h3>Simple, secure access</h3>
          <p>
            Administrators manage every module. Staff can view the dashboard and
            manage customers, bookings and albums. Financial records, reports,
            user management, settings and deletion are restricted to
            administrators.
          </p>
        </div>
      </div>
    </>
  );
}
