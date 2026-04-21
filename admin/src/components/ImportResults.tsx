import { Button } from "@strapi/design-system";
import { useState } from "react";

interface ImportResultsProps {
  summary: { created: number; updated: number; skipped: number };
  errors: string[];
  warnings: string[];
  onDismiss: () => void;
}

const INITIAL_ERROR_LIMIT = 5;

const ImportResults = ({ summary, errors, warnings, onDismiss }: ImportResultsProps) => {
  const [showAllErrors, setShowAllErrors] = useState(false);

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const borderColor = hasErrors ? "#D02B20" : hasWarnings ? "#D9822F" : "#328048";
  const bgColor = hasErrors ? "#FDF0EF" : hasWarnings ? "#FFF8F0" : "#F0FFF4";

  const visibleErrors = showAllErrors ? errors : errors.slice(0, INITIAL_ERROR_LIMIT);
  const hiddenCount = errors.length - INITIAL_ERROR_LIMIT;

  return (
    <div
      style={{
        marginTop: "16px",
        borderLeft: `4px solid ${borderColor}`,
        background: bgColor,
        borderRadius: "4px",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#32324D",
          }}
        >
          Import Results
        </span>
        <Button variant="tertiary" size="S" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      <div style={{ marginTop: "8px", fontSize: "14px" }}>
        {summary.created > 0 && <span style={{ color: "#328048" }}>{summary.created} created</span>}
        {summary.created > 0 && (summary.updated > 0 || summary.skipped > 0) && ", "}
        {summary.updated > 0 && <span style={{ color: "#1C6EA4" }}>{summary.updated} updated</span>}
        {summary.updated > 0 && summary.skipped > 0 && ", "}
        {summary.skipped > 0 && <span style={{ color: "#8E8EA9" }}>{summary.skipped} skipped</span>}
        {summary.created === 0 && summary.updated === 0 && summary.skipped === 0 && (
          <span style={{ color: "#8E8EA9" }}>No changes made</span>
        )}
      </div>

      {hasWarnings && (
        <div style={{ marginTop: "12px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#D9822F" }}>Warnings</div>
          {warnings.map((w) => (
            <div key={w} style={{ marginTop: "4px", fontSize: "12px", color: "#B76E1E" }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {hasErrors && (
        <div style={{ marginTop: "12px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#D02B20" }}>Errors ({errors.length})</div>
          {visibleErrors.map((e) => (
            <div key={e} style={{ marginTop: "4px", fontSize: "12px", color: "#B72B1A" }}>
              {e}
            </div>
          ))}
          {!showAllErrors && hiddenCount > 0 && (
            <div style={{ marginTop: "8px" }}>
              <Button variant="tertiary" size="S" onClick={() => setShowAllErrors(true)}>
                Show all {errors.length} errors
              </Button>
            </div>
          )}
          {showAllErrors && errors.length > INITIAL_ERROR_LIMIT && (
            <div style={{ marginTop: "8px" }}>
              <Button variant="tertiary" size="S" onClick={() => setShowAllErrors(false)}>
                Show fewer
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { ImportResults };
