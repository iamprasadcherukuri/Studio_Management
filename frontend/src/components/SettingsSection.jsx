import React, { useId, useState } from "react";
import { Plus, Minus } from "lucide-react";

export default function SettingsSection({ title, children }) {
  const [expanded, setExpanded] = useState(false),
    id = useId();
  return (
    <section
      className={`card settings-section${expanded ? " is-expanded" : ""}`}
    >
      <h2 className="settings-section-heading">
        <button
          type="button"
          id={`${id}-heading`}
          aria-expanded={expanded}
          aria-controls={`${id}-content`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{title}</span>
          {expanded ? (
            <Minus aria-hidden="true" size={21} />
          ) : (
            <Plus aria-hidden="true" size={21} />
          )}
        </button>
      </h2>
      <div
        id={`${id}-content`}
        className="settings-section-panel"
        role="region"
        aria-labelledby={`${id}-heading`}
        aria-hidden={!expanded}
        inert={expanded ? undefined : true}
      >
        <div className="settings-section-clip">
          <div className="settings-section-content">{children}</div>
        </div>
      </div>
    </section>
  );
}
