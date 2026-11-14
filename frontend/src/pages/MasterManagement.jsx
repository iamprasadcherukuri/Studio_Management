import React, { useEffect, useState } from "react";
import { api, message } from "../services/api";
import { masterCode } from "../../../shared/master-code.mjs";
export default function MasterManagement({
  ui: { Modal, ErrorBox },
  embedded = false,
}) {
  const [entities, setEntities] = useState([]),
    [selected, setSelected] = useState(""),
    [rows, setRows] = useState([]),
    [summary, setSummary] = useState({}),
    [entitySearch, setEntitySearch] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [entityPage, setEntityPage] = useState(1),
    [entityTotal, setEntityTotal] = useState(0);
  const entity = entities.find((e) => String(e.entity_id) === String(selected));
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/master/entities", {
          params: { search: entitySearch, page: entityPage, limit: 100 },
        });
        if (alive) {
          setEntities(data.data);
          setSummary(data.summary || {});
          setEntityTotal(data.total);
          setSelected((previous) =>
            data.data.some((e) => String(e.entity_id) === String(previous))
              ? previous
              : data.data[0]?.entity_id || "",
          );
        }
      } catch (e) {
        if (alive) setError(message(e));
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [entitySearch, entityPage, revision]);
  useEffect(() => {
    let alive = true;
    setRows([]);
    if (!selected) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/master/entities/${selected}/values`, {
          params: { search, status, page, limit: 20 },
        });
        if (alive) {
          setRows(data.data);
          setTotal(data.total);
        }
      } catch (e) {
        if (alive) setError(message(e));
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selected, search, status, page, revision]);
  function start(kind, row) {
    setError("");
    setNotice("");
    setForm({
      kind,
      id: row?.[kind === "entity" ? "entity_id" : "entity_value_id"],
      name: row?.[kind === "entity" ? "entity_name" : "value_name"] || "",
      code: row?.[kind === "entity" ? "entity_code" : "value_code"] || "",
      description: row?.description || "",
      display_order: row?.display_order || 0,
      is_active: row?.is_active ?? true,
    });
  }
  let code = "",
    codeError = "";
  try {
    code = form?.id ? form.code : masterCode(form?.name || "");
  } catch (e) {
    if (form?.name?.trim()) codeError = e.message;
  }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const isEntity = form.kind === "entity",
        path = form.id
          ? `/master/${isEntity ? "entities" : "values"}/${form.id}`
          : isEntity
            ? "/master/entities"
            : `/master/entities/${selected}/values`;
      const { data } = await api[form.id ? "put" : "post"](path, {
        name: form.name,
        description: form.description,
        display_order: Number(form.display_order),
        is_active: form.is_active,
      });
      if (isEntity) {
        setSelected(data.entity_id);
        setEntitySearch(form.name);
        setEntityPage(1);
      }
      setNotice("Master saved. Saved transaction values are preserved.");
      setForm(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggle(kind, row) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(
        `/master/${kind === "entity" ? "entities" : "values"}/${row[kind === "entity" ? "entity_id" : "entity_value_id"]}/status`,
        { is_active: !row.is_active },
      );
      setNotice("Status updated. Existing records retain their saved choices.");
      setRevision((n) => n + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="master-management" className="card master-management">
      {!embedded && <h2>Master Management</h2>}
      <p>
        Manage dropdown choices. Codes and saved transaction mappings stay
        unchanged when names are edited.
      </p>
      <div className="master-summary">
        {[
          ["Total Master Entities", summary.entities],
          ["Total Master Values", summary.values],
          ["Active Master Values", summary.active_values],
        ].map(([label, n]) => (
          <div className="master-summary-item" key={label}>
            <span>{label}</span>
            <strong>{n ?? "—"}</strong>
          </div>
        ))}
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      <div className="master-toolbar">
        <label>
          Search entities
          <input
            value={entitySearch}
            onChange={(e) => {
              setEntitySearch(e.target.value);
              setEntityPage(1);
            }}
          />
        </label>
        <label>
          Entity
          <select
            aria-label="Master entity"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Select entity</option>
            {entities.map((e) => (
              <option key={e.entity_id} value={e.entity_id}>
                {e.entity_name}
                {e.is_active ? "" : " (Inactive)"}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => start("entity")}>
          Add entity
        </button>
        {entity && (
          <>
            <button onClick={() => start("entity", entity)}>Edit entity</button>
            <button disabled={busy} onClick={() => toggle("entity", entity)}>
              {entity.is_active ? "Deactivate entity" : "Activate entity"}
            </button>
          </>
        )}
      </div>
      {entityTotal > 100 && (
        <div className="master-toolbar">
          <button
            disabled={entityPage === 1}
            onClick={() => setEntityPage((p) => p - 1)}
          >
            Previous entities
          </button>
          <span>Entity page {entityPage}</span>
          <button
            disabled={entityPage * 100 >= entityTotal}
            onClick={() => setEntityPage((p) => p + 1)}
          >
            Next entities
          </button>
        </div>
      )}
      {selected && (
        <>
          <div className="master-toolbar">
            <label>
              Search values
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Status
              <select
                aria-label="Master value status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button
              className="primary"
              disabled={!entity?.is_active}
              onClick={() => start("value")}
            >
              Add value
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Value name",
                    "Value code",
                    "Display order",
                    "Status",
                    "Actions",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.entity_value_id}>
                    <td>{row.value_name}</td>
                    <td>{row.value_code}</td>
                    <td>{row.display_order}</td>
                    <td>{row.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <div className="master-actions">
                        <button onClick={() => start("value", row)}>
                          Edit
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => toggle("value", row)}
                        >
                          {row.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && !loading && <p>No master values found.</p>}
          <div className="master-toolbar">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} · {total} values
            </span>
            <button
              disabled={page * 20 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {loading && <p role="status">Loading masters…</p>}
      {form && (
        <Modal
          title={`${form.id ? "Edit" : "Add"} ${form.kind}`}
          close={() => !busy && setForm(null)}
        >
          <form onSubmit={save}>
            <ErrorBox error={error} />
            <div className="form-grid">
              {form.kind === "value" && (
                <label>
                  Entity
                  <input readOnly value={entity?.entity_name || selected} />
                </label>
              )}
              <label>
                {form.kind === "entity" ? "Entity" : "Value"} name
                <input
                  autoFocus
                  required
                  maxLength={150}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Generated code
                <input readOnly value={code} />
                {codeError && <small role="alert">{codeError}</small>}
              </label>
              <label>
                Description
                <textarea
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label>
                Display order
                <input
                  type="number"
                  required
                  min="0"
                  max="2147483647"
                  step="1"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({ ...form, display_order: e.target.value })
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={String(form.is_active)}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.value === "true" })
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy || !code}>
                {busy ? "Saving…" : "Save master"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
