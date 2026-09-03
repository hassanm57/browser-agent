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
      <div className="p-12 text-center text-zinc-500 space-y-3">
        <History className="w-8 h-8 text-zinc-600 mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-300">No Execution History</h3>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          Completed and cancelled pipeline executions will be permanently stored in your local SQLite database and listed here.
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
          "border-b border-zinc-800/60 hover:bg-zinc-900/60 text-xs transition-colors " +
          (isCurrentActiveRun ? "bg-blue-950/20" : "")
        }
      >
        <td className="py-3 px-4 font-mono text-zinc-400">#{runItem.id}</td>
        <td className="py-3 px-4 font-semibold text-zinc-200">{runItem.country_name}</td>
        <td className="py-3 px-4">
          <span
            className={
              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border " +
              (isSuccess
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                : "bg-red-950/60 text-red-400 border-red-800/50")
            }
          >
            {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {runItem.status}
          </span>
        </td>
        <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
          {runItem.started_at ? runItem.started_at.replace("T", " ").slice(0, 19) : "—"}
        </td>
        <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
          {runItem.finished_at ? runItem.finished_at.replace("T", " ").slice(0, 19) : "—"}
        </td>
        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={function () {
                props.onSelectRun(runItem.id);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition-colors"
              title="Load full data from this run"
            >
              <Eye className="w-3 h-3" />
              <span>{isCurrentActiveRun ? "Active" : "Inspect"}</span>
            </button>
            <button
              onClick={function () {
                props.onDeleteRun(runItem.id);
              }}
              className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Pipeline Run History
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Archived intelligence extractions stored locally in SQLite. Click Inspect on any row to view its data.
          </p>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-[11px] font-semibold text-zinc-400">
                <th className="py-3 px-4">Run ID</th>
                <th className="py-3 px-4">Country</th>
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
