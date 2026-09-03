import { useState } from "react";
import type { SourceItem } from "../types";
import { Globe, Plus, Trash2, X, Rss } from "lucide-react";

interface SourcesPageProps {
  sourcesList: SourceItem[];
  onToggleSource: (sourceIndex: number, enabled: boolean) => void;
  onDeleteSource: (sourceIndex: number) => void;
  onAddSource: (newSource: SourceItem) => void;
}

export function SourcesPage(props: SourcesPageProps) {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("web");
  const [formErrorMessage, setFormErrorMessage] = useState("");

  // Handle URL change with auto-detection of RSS feeds
  function handleUrlChange(event: React.ChangeEvent<HTMLInputElement>) {
    const enteredUrl = event.target.value;
    setNewUrl(enteredUrl);

    const lower = enteredUrl.toLowerCase();
    if (lower.includes("/rss") || lower.includes("/feed") || lower.endsWith(".xml")) {
      setNewType("rss");
    }
  }

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (newName.trim().length === 0) {
      setFormErrorMessage("Please enter a valid source name.");
      return;
    }
    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
      setFormErrorMessage("URL must begin with http:// or https://");
      return;
    }

    props.onAddSource({
      name: newName.trim(),
      category: "national_regional",
      type: newType,
      url: newUrl.trim(),
      enabled: true
    });

    setNewName("");
    setNewUrl("");
    setNewType("web");
    setFormErrorMessage("");
    setIsAddFormOpen(false);
  }

  // Count active sources
  let activeCount = 0;
  for (let sourceIndex = 0; sourceIndex < props.sourcesList.length; sourceIndex++) {
    if (props.sourcesList[sourceIndex].enabled) {
      activeCount = activeCount + 1;
    }
  }

  // Render sources list rows using traditional for loop
  const renderedSourceRows = [];
  for (let sourceIndex = 0; sourceIndex < props.sourcesList.length; sourceIndex++) {
    const sourceItem = props.sourcesList[sourceIndex];
    const isRss = sourceItem.type === "rss";

    renderedSourceRows.push(
      <div
        key={sourceItem.name + "_" + sourceIndex}
        className="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800/80 flex items-center justify-between gap-4 transition-all hover:border-zinc-750"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className={
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors " +
              (isRss
                ? "bg-amber-500/10 text-amber-400"
                : "bg-blue-500/10 text-blue-400")
            }
          >
            {isRss ? <Rss className="w-4 h-4" strokeWidth={1.75} /> : <Globe className="w-4 h-4" strokeWidth={1.75} />}
          </div>

          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-100">{sourceItem.name}</span>
              <span
                className={
                  "text-[9px] px-1.5 py-0.2 rounded uppercase font-mono font-medium " +
                  (isRss
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-blue-500/10 text-blue-300")
                }
              >
                {sourceItem.type}
              </span>
            </div>
            <a
              href={sourceItem.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-zinc-400 hover:text-blue-400 truncate block mt-0.5"
            >
              {sourceItem.url}
            </a>
          </div>
        </div>

        {/* Toggle Switch and Delete Button */}
        <div className="flex items-center gap-3 shrink-0">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={sourceItem.enabled}
              onChange={function (e) {
                props.onToggleSource(sourceIndex, e.target.checked);
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>

          <button
            onClick={function () {
              props.onDeleteSource(sourceIndex);
            }}
            className="text-zinc-500 hover:text-red-400 p-1.5 rounded hover:bg-zinc-800 transition-colors"
            title="Delete source"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            Intelligence Sources Manager
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {props.sourcesList.length} configured · {activeCount} active. Changes persist directly into sources.json.
          </p>
        </div>

        <button
          onClick={function () {
            setIsAddFormOpen(!isAddFormOpen);
            setFormErrorMessage("");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-sm self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add New Source</span>
        </button>
      </div>

      {/* Add New Source Accordion Form */}
      {isAddFormOpen && (
        <form
          onSubmit={handleFormSubmit}
          className="p-4 rounded-lg bg-zinc-900 border border-zinc-700/80 space-y-4 shadow-lg animate-in fade-in-50 duration-150"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Add Intelligence Source
            </h3>
            <button
              type="button"
              onClick={function () {
                setIsAddFormOpen(false);
              }}
              className="text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formErrorMessage && (
            <div className="text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-800">
              {formErrorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Source Name
              </label>
              <input
                type="text"
                placeholder="e.g. Al Jazeera English"
                value={newName}
                onChange={function (e) {
                  setNewName(e.target.value);
                }}
                className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Target URL
              </label>
              <input
                type="text"
                placeholder="https://..."
                value={newUrl}
                onChange={handleUrlChange}
                className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-zinc-400">Type:</label>
              <select
                value={newType}
                onChange={function (e) {
                  setNewType(e.target.value);
                }}
                className="px-2 py-1 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none"
              >
                <option value="web">Web Scraper</option>
                <option value="rss">RSS Feed</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={function () {
                  setIsAddFormOpen(false);
                }}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold transition-colors shadow"
              >
                Save Source
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Sources List */}
      <div className="space-y-2.5">
        {renderedSourceRows.length > 0 ? (
          renderedSourceRows
        ) : (
          <div className="p-8 text-center text-xs text-zinc-500">
            No sources configured in sources.json.
          </div>
        )}
      </div>
    </div>
  );
}
