import { useState, useEffect } from "react";
import type { ApplicationSettings } from "../types";
import { Save, Check, Cpu, Globe, Sliders, Palette, Sun, Moon } from "lucide-react";

interface SettingsPageProps {
  currentSettings: ApplicationSettings;
  onSaveSettings: (updatedSettings: ApplicationSettings) => void;
  currentTheme?: "dark" | "light";
  onToggleTheme?: () => void;
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

  const isDarkModeActive = props.currentTheme === "dark";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            System & AI Settings
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure appearance theme, AI model endpoint parameters, browser behaviors, and mining thresholds.
          </p>
        </div>

        {saveSuccessMessage && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-in fade-in-50">
            <Check className="w-4 h-4" />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </div>

      {/* Appearance & Theme Section */}
      <div className="p-5 rounded-lg bg-card border border-border space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Palette className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Appearance & Interface Theme
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-muted/30 border border-border">
          <div>
            <span className="text-xs font-semibold text-foreground block">
              Theme Mode
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">
              Toggle between Crisp Light Mode and Deep Intelligence Dark Mode. Preference is saved automatically.
            </span>
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-muted border border-border gap-1 shrink-0 select-none">
            <button
              type="button"
              onClick={function () {
                if (isDarkModeActive && props.onToggleTheme) {
                  props.onToggleTheme();
                }
              }}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer " +
                (!isDarkModeActive
                  ? "bg-card text-foreground font-semibold shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light</span>
            </button>

            <button
              type="button"
              onClick={function () {
                if (!isDarkModeActive && props.onToggleTheme) {
                  props.onToggleTheme();
                }
              }}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer " +
                (isDarkModeActive
                  ? "bg-card text-foreground font-semibold shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Moon className="w-3.5 h-3.5 text-blue-400" />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6">
        {/* LLM & Inference Parameters Card */}
        <div className="p-5 rounded-lg bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Cpu className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              AI Model Inference Engine
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                Model Server Base URL
              </label>
              <input
                type="text"
                value={formState.vllm_base_url || ""}
                onChange={function (e) {
                  handleFieldChange("vllm_base_url", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-background border border-border text-xs text-foreground font-mono outline-none focus:border-primary transition-colors"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Default: http://10.13.12.121:8000/v1
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                API Key
              </label>
              <input
                type="text"
                value={formState.vllm_api_key || ""}
                onChange={function (e) {
                  handleFieldChange("vllm_api_key", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-background border border-border text-xs text-foreground font-mono outline-none focus:border-primary transition-colors"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Local instance default is EMPTY
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                Model Name
              </label>
              <input
                type="text"
                value={formState.llm_model_name || ""}
                onChange={function (e) {
                  handleFieldChange("llm_model_name", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-background border border-border text-xs text-foreground font-mono outline-none focus:border-primary transition-colors"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Currently configured: Strategic AI Model
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                Max Output Tokens
              </label>
              <input
                type="number"
                value={formState.llm_maximum_tokens || "8192"}
                onChange={function (e) {
                  handleFieldChange("llm_maximum_tokens", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-background border border-border text-xs text-foreground font-mono outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Browser & Profile Settings Card */}
        <div className="p-5 rounded-lg bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Globe className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Browser-Use & Chrome Profile
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 rounded bg-muted/40 border border-border">
              <div>
                <span className="text-xs font-medium text-foreground block">Headless Browser</span>
                <span className="text-[10px] text-muted-foreground">
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
                <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-muted/40 border border-border">
              <div>
                <span className="text-xs font-medium text-foreground block">Use Real Chrome Profile</span>
                <span className="text-[10px] text-muted-foreground">
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
                <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Mining Thresholds Card */}
        <div className="p-5 rounded-lg bg-card border border-border space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Sliders className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Timeline Mining Thresholds
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                Max Tweets Per Trend
              </label>
              <input
                type="number"
                value={formState.maximum_tweets_per_trend || "20"}
                onChange={function (e) {
                  handleFieldChange("maximum_tweets_per_trend", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-background border border-border text-xs text-foreground font-mono outline-none focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                Max Scroll Rounds
              </label>
              <input
                type="number"
                value={formState.maximum_scroll_rounds || "12"}
                onChange={function (e) {
                  handleFieldChange("maximum_scroll_rounds", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-background border border-border text-xs text-foreground font-mono outline-none focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                Top Trends To Mine
              </label>
              <input
                type="number"
                value={formState.number_of_trends_to_mine || "5"}
                onChange={function (e) {
                  handleFieldChange("number_of_trends_to_mine", e.target.value);
                }}
                className="w-full px-3 py-2 rounded bg-background border border-border text-xs text-foreground font-mono outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
}
