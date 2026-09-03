import { useState, useEffect } from "react";
import type { ApplicationSettings } from "../types";
import { Save, Check, Cpu, Globe, Sliders } from "lucide-react";

interface SettingsPageProps {
  currentSettings: ApplicationSettings;
  onSaveSettings: (updatedSettings: ApplicationSettings) => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const [formState, setFormState] = useState<ApplicationSettings>(props.currentSettings);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false);

  // Sync form state if props change
  useEffect(function () {
    setFormState(props.currentSettings);
  }, [props.currentSettings]);

  function handleFieldChange(fieldKey: keyof ApplicationSettings, fieldValue: string) {
    const updatedFormState = { ...formState };
    updatedFormState[fieldKey] = fieldValue;
    setFormState(updatedFormState);
  }

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    props.onSaveSettings(formState);
    setSaveSuccessMessage(true);
    setTimeout(function () {
      setSaveSuccessMessage(false);
    }, 2500);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">
            System & LLM Settings
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure local vLLM/llama.cpp inference parameters, Chrome browser behaviors, and mining thresholds.
          </p>
        </div>

        {saveSuccessMessage && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-xs font-semibold animate-in fade-in-50">
            <Check className="w-4 h-4" />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6">
        {/* LLM & Inference Parameters Card */}
        <div className="p-5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <Cpu className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Local LLM Inference (vLLM / llama.cpp)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                vLLM Base URL
              </label>
              <input
                type="text"
                value={formState.vllm_base_url || ""}
                onChange={function (e) {
                  handleFieldChange("vllm_base_url", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Default: http://10.13.12.121:8000/v1
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                API Key
              </label>
              <input
                type="text"
                value={formState.vllm_api_key || ""}
                onChange={function (e) {
                  handleFieldChange("vllm_api_key", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Local instance default is EMPTY
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Model Name
              </label>
              <input
                type="text"
                value={formState.llm_model_name || ""}
                onChange={function (e) {
                  handleFieldChange("llm_model_name", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Currently configured: qwen3-14b
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Max Output Tokens
              </label>
              <input
                type="number"
                value={formState.llm_maximum_tokens || "8192"}
                onChange={function (e) {
                  handleFieldChange("llm_maximum_tokens", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Browser & Profile Settings Card */}
        <div className="p-5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <Globe className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Browser-Use & Chrome Profile
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 rounded bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Headless Browser</span>
                <span className="text-[10px] text-zinc-500">
                  Run Chrome in background (off = headful visible window)
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.headless_mode === "true"}
                  onChange={function (e) {
                    handleFieldChange("headless_mode", e.target.checked ? "true" : "false");
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Use Real Chrome Profile</span>
                <span className="text-[10px] text-zinc-500">
                  Clones default profile to retain logged-in X.com session
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.use_real_chrome === "true"}
                  onChange={function (e) {
                    handleFieldChange("use_real_chrome", e.target.checked ? "true" : "false");
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Mining Thresholds Card */}
        <div className="p-5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <Sliders className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Timeline Mining Thresholds
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Max Tweets Per Trend
              </label>
              <input
                type="number"
                value={formState.maximum_tweets_per_trend || "20"}
                onChange={function (e) {
                  handleFieldChange("maximum_tweets_per_trend", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Max Scroll Rounds
              </label>
              <input
                type="number"
                value={formState.maximum_scroll_rounds || "12"}
                onChange={function (e) {
                  handleFieldChange("maximum_scroll_rounds", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Top Trends To Mine
              </label>
              <input
                type="number"
                value={formState.number_of_trends_to_mine || "5"}
                onChange={function (e) {
                  handleFieldChange("number_of_trends_to_mine", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-mono outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
}
