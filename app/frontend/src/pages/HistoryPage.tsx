import type { PipelineRunRecord } from "../types";
import { History, CheckCircle2, AlertCircle, Trash2, Eye } from "lucide-react";

interface HistoryPageProps {
  runsList: PipelineRunRecord[];
  activeRunId: number | null;
  onSelectRun: (runId: number) => void;
  onDeleteRun: (runId: number) => void;
}

export function HistoryPage(props: HistoryPageProps) {
  if (props.runsList.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground space-y-3">
        <History className="w-8 h-8 text-muted-foreground mx-auto" />
        <h3 className="text-sm font-semibold text-foreground">No Execution History</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Completed and cancelled pipeline executions will be permanently stored in your local storage and listed here.
        </p>
      </div>
    );
  }

  // Render rows using traditional for loop
  const renderedHistoryRows = [];
  for (let runIndex = 0; runIndex < props.runsList.length; runIndex++) {
    const runItem = props.runsList[runIndex];
    const isSuccess = runItem.status === "completed";
    const isCurrentActiveRun = props.activeRunId === runItem.id;

    renderedHistoryRows.push(
      <tr
        key={runItem.id}
        className={
          "border-b border-border/60 hover:bg-muted/50 text-xs transition-colors " +
          (isCurrentActiveRun ? "bg-blue-500/10" : "")
        }
      >
        <td className="py-3 px-4 font-mono text-muted-foreground">#{runItem.id}</td>
        <td className="py-3 px-4">
          <span
            className={
              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium " +
              (isSuccess
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/15 text-red-600 dark:text-red-400")
            }
          >
            {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {runItem.status}
          </span>
        </td>
        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
          {runItem.started_at ? runItem.started_at.replace("T", " ").slice(0, 19) : "—"}
        </td>
        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
          {runItem.finished_at ? runItem.finished_at.replace("T", " ").slice(0, 19) : "—"}
        </td>
        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={function () {
                props.onSelectRun(runItem.id);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground border border-border/60 text-[11px] font-medium transition-colors cursor-pointer"
              title="Load full data from this run"
            >
              <Eye className="w-3 h-3" />
              <span>{isCurrentActiveRun ? "Active" : "Inspect"}</span>
            </button>
            <button
              onClick={function () {
                props.onDeleteRun(runItem.id);
              }}
              className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-muted transition-colors cursor-pointer"
              title="Delete record"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-border/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Pipeline Run History
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Archived intelligence extractions stored in local records. Click Inspect on any row to view its data.
          </p>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/80 bg-muted/60 text-[11px] font-semibold text-muted-foreground">
                <th className="py-3 px-4">Run ID</th>
                <th className="py-3 px-4">Execution Status</th>
                <th className="py-3 px-4">Started At</th>
                <th className="py-3 px-4">Finished At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>{renderedHistoryRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
