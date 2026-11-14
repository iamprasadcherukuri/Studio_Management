import React, { useEffect, useId, useRef, useState } from "react";
import { api, message } from "../services/api";
const label = (customer) =>
  `${customer.customer_name} — ${customer.mobile_number}`;
export default function CustomerSearchSelect({
  value,
  onChange,
  required = true,
  id = "customer_id",
}) {
  const listId = useId(),
    input = useRef(null),
    epoch = useRef(0);
  const [text, setText] = useState(""),
    [selected, setSelected] = useState(null),
    [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (String(selected?.customer_id) === String(value)) return;
    setSelected(null);
    const controller = new AbortController(),
      version = epoch.current;
    let alive = true;
    setLoading(true);
    setError("");
    api
      .get("/customers/search", {
        params: { id: value },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!alive || version !== epoch.current) return;
        const customer = data.data[0];
        setSelected(customer || null);
        setText(customer ? label(customer) : "");
        if (!customer)
          setError(
            "Selected customer is unavailable. Search and select another customer.",
          );
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
  }, [value]);
  useEffect(() => {
    input.current?.setCustomValidity(
      required && !selected
        ? "Select an existing customer from the search results."
        : "",
    );
  }, [selected, required, text]);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);
  useEffect(() => {
    if (!open || selected) {
      setLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController(),
      version = epoch.current;
    setLoading(true);
    setError("");
    setRows([]);
    setActive(-1);
    const timer = setTimeout(() => {
      api
        .get("/customers/search", {
          params: { q: text },
          signal: controller.signal,
        })
        .then(({ data }) => {
          if (alive && version === epoch.current) {
            setRows(data.data);
            setActive(-1);
          }
        })
        .catch((e) => {
          if (alive && !controller.signal.aborted) setError(message(e));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, open, selected]);
  function choose(customer) {
    epoch.current++;
    setSelected(customer);
    setText(label(customer));
    setOpen(false);
    setError("");
    setRows([]);
    onChange(customer.customer_id);
  }
  function keyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      if (rows.length)
        setActive((previous) =>
          event.key === "ArrowDown"
            ? (previous + 1) % rows.length
            : previous <= 0
              ? rows.length - 1
              : previous - 1,
        );
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (active >= 0 && rows[active]) choose(rows[active]);
    }
  }
  return (
    <div
      className="customer-search-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>
        <span>Search Customer{required && <b> *</b>}</span>
      </label>
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        required={required}
        placeholder="Search by customer name or mobile number..."
        value={text}
        aria-expanded={open && !selected}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-describedby={error ? `${listId}-error` : undefined}
        aria-invalid={error ? true : undefined}
        onFocus={() => {
          if (!selected) setOpen(true);
        }}
        onKeyDown={keyDown}
        onChange={(event) => {
          epoch.current++;
          setText(event.target.value);
          setSelected(null);
          setError("");
          setOpen(true);
          setRows([]);
          setActive(-1);
          onChange("");
        }}
      />
      {open && !selected && (
        <div className="customer-search-menu">
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching customers"
            aria-busy={loading}
          >
            {rows.map((customer, index) => (
              <li
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                key={customer.customer_id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(customer)}
              >
                {label(customer)}
              </li>
            ))}
          </ul>
          {loading ? (
            <div className="customer-search-status" role="status">
              Searching customers…
            </div>
          ) : !error && !rows.length ? (
            <div className="customer-search-status" role="status">
              No customers found
            </div>
          ) : null}
        </div>
      )}
      {error && (
        <small id={`${listId}-error`} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
