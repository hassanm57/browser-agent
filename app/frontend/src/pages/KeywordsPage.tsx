import { useState } from "react";
import type { KeywordsData, KeywordTopicItem } from "../types";
import { Tags, Plus, X, Trash2, Download, Check, Copy, ExternalLink } from "lucide-react";

interface KeywordsPageProps {
  keywordsData: KeywordsData | null;
  onSaveKeywords: (updatedData: KeywordsData) => void;
  activeRunId: number | null;
}

export function KeywordsPage(props: KeywordsPageProps) {
  // State for which topic is currently adding a keyword
  const [topicAddingKeywordIndex, setTopicAddingKeywordIndex] = useState<number | null>(null);
  const [newKeywordInputText, setNewKeywordInputText] = useState("");

  // State for inline editing of a keyword
  const [editingTopicIndex, setEditingTopicIndex] = useState<number | null>(null);
  const [editingKeywordIndex, setEditingKeywordIndex] = useState<number | null>(null);
  const [editingKeywordText, setEditingKeywordText] = useState("");

  if (!props.keywordsData || !props.keywordsData.topics) {
    return (
      <div className="p-12 text-center text-muted-foreground space-y-3">
        <Tags className="w-8 h-8 text-muted-foreground mx-auto" />
        <h3 className="text-sm font-semibold text-foreground">No Keywords Synthesized</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Execute the intelligence pipeline to run LLM topic synthesis and generate high-recall search keywords.
        </p>
      </div>
    );
  }

  const topicsList = props.keywordsData.topics;

  // Function to remove a single keyword from a topic
  function handleRemoveKeyword(topicIndex: number, keywordIndexToRemove: number) {
    const updatedTopics: KeywordTopicItem[] = [];
    for (let currentTopicIndex = 0; currentTopicIndex < topicsList.length; currentTopicIndex++) {
      const topicItem = topicsList[currentTopicIndex];
      if (currentTopicIndex === topicIndex) {
        const updatedTerms: string[] = [];
        for (let termIndex = 0; termIndex < topicItem.terms.length; termIndex++) {
          if (termIndex !== keywordIndexToRemove) {
            updatedTerms.push(topicItem.terms[termIndex]);
          }
        }
        updatedTopics.push({
          label: topicItem.label,
          category: topicItem.category,
          boolean_query: topicItem.boolean_query,
          sample_tweets: topicItem.sample_tweets,
          terms: updatedTerms
        });
      } else {
        updatedTopics.push(topicItem);
      }
    }

    const updatedKeywordsData: KeywordsData = {
      generated_at: props.keywordsData!.generated_at,
      country: props.keywordsData!.country,
      sources_consulted: props.keywordsData!.sources_consulted,
      total_topics: updatedTopics.length,
      topics: updatedTopics
    };

    props.onSaveKeywords(updatedKeywordsData);
  }

  // Function to add a keyword to a topic
  function handleAddKeyword(topicIndex: number) {
    const trimmedInput = newKeywordInputText.trim();
    if (trimmedInput.length === 0) return;

    const updatedTopics: KeywordTopicItem[] = [];
    for (let currentTopicIndex = 0; currentTopicIndex < topicsList.length; currentTopicIndex++) {
      const topicItem = topicsList[currentTopicIndex];
      if (currentTopicIndex === topicIndex) {
        const updatedTerms = [...topicItem.terms, trimmedInput];
        updatedTopics.push({
          label: topicItem.label,
          category: topicItem.category,
          boolean_query: topicItem.boolean_query,
          sample_tweets: topicItem.sample_tweets,
          terms: updatedTerms
        });
      } else {
        updatedTopics.push(topicItem);
      }
    }

    const updatedKeywordsData: KeywordsData = {
      generated_at: props.keywordsData!.generated_at,
      country: props.keywordsData!.country,
      sources_consulted: props.keywordsData!.sources_consulted,
      total_topics: updatedTopics.length,
      topics: updatedTopics
    };

    props.onSaveKeywords(updatedKeywordsData);
    setNewKeywordInputText("");
    setTopicAddingKeywordIndex(null);
  }

  // Function to save an inline-edited keyword
  function handleSaveEditedKeyword(topicIndex: number, termIndexToUpdate: number) {
    const trimmedInput = editingKeywordText.trim();
    if (trimmedInput.length === 0) {
      handleRemoveKeyword(topicIndex, termIndexToUpdate);
      setEditingTopicIndex(null);
      setEditingKeywordIndex(null);
      return;
    }

    const updatedTopics: KeywordTopicItem[] = [];
    for (let currentTopicIndex = 0; currentTopicIndex < topicsList.length; currentTopicIndex++) {
      const topicItem = topicsList[currentTopicIndex];
      if (currentTopicIndex === topicIndex) {
        const updatedTerms: string[] = [];
        for (let termIndex = 0; termIndex < topicItem.terms.length; termIndex++) {
          if (termIndex === termIndexToUpdate) {
            updatedTerms.push(trimmedInput);
          } else {
            updatedTerms.push(topicItem.terms[termIndex]);
          }
        }
        updatedTopics.push({
          label: topicItem.label,
          category: topicItem.category,
          boolean_query: topicItem.boolean_query,
          sample_tweets: topicItem.sample_tweets,
          terms: updatedTerms
        });
      } else {
        updatedTopics.push(topicItem);
      }
    }

    const updatedKeywordsData: KeywordsData = {
      generated_at: props.keywordsData!.generated_at,
      country: props.keywordsData!.country,
      sources_consulted: props.keywordsData!.sources_consulted,
      total_topics: updatedTopics.length,
      topics: updatedTopics
    };

    props.onSaveKeywords(updatedKeywordsData);
    setEditingTopicIndex(null);
    setEditingKeywordIndex(null);
  }

  // Function to delete an entire topic
  function handleDeleteTopic(topicIndexToDelete: number) {
    const updatedTopics: KeywordTopicItem[] = [];
    for (let currentTopicIndex = 0; currentTopicIndex < topicsList.length; currentTopicIndex++) {
      if (currentTopicIndex !== topicIndexToDelete) {
        updatedTopics.push(topicsList[currentTopicIndex]);
      }
    }

    const updatedKeywordsData: KeywordsData = {
      generated_at: props.keywordsData!.generated_at,
      country: props.keywordsData!.country,
      sources_consulted: props.keywordsData!.sources_consulted,
      total_topics: updatedTopics.length,
      topics: updatedTopics
    };

    props.onSaveKeywords(updatedKeywordsData);
  }

  // Function to download JSON
  function handleExportJson() {
    const jsonString = JSON.stringify(props.keywordsData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "keywords_export.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  // Function to download CSV
  function handleExportCsv() {
    const csvRows = ["Topic,Category,Keyword"];
    for (let currentTopicIndex = 0; currentTopicIndex < topicsList.length; currentTopicIndex++) {
      const topicItem = topicsList[currentTopicIndex];
      const escapedLabel = topicItem.label.replace(/"/g, '""');
      const escapedCategory = topicItem.category.replace(/"/g, '""');
      for (let termIndex = 0; termIndex < topicItem.terms.length; termIndex++) {
        const term = topicItem.terms[termIndex].replace(/"/g, '""');
        csvRows.push('"' + escapedLabel + '","' + escapedCategory + '","' + term + '"');
      }
    }
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "keywords_export.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // Calculate total terms count
  let totalTermsSum = 0;
  for (let topicIndex = 0; topicIndex < topicsList.length; topicIndex++) {
    totalTermsSum = totalTermsSum + topicsList[topicIndex].terms.length;
  }

  // Render topics using traditional for loop
  const renderedTopicCards = [];
  for (let topicIndex = 0; topicIndex < topicsList.length; topicIndex++) {
    const topicItem = topicsList[topicIndex];
    const termsList = topicItem.terms;

    // Render keyword chips using traditional for loop
    const renderedKeywordChips = [];
    for (let termIndex = 0; termIndex < termsList.length; termIndex++) {
      const termString = termsList[termIndex];
      const isEditingThisChip =
        editingTopicIndex === topicIndex && editingKeywordIndex === termIndex;

      if (isEditingThisChip) {
        renderedKeywordChips.push(
          <div
            key={topicItem.label + "_chip_edit_" + termIndex}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 border border-blue-500"
          >
            <input
              type="text"
              value={editingKeywordText}
              onChange={function (e) {
                setEditingKeywordText(e.target.value);
              }}
              onKeyDown={function (e) {
                if (e.key === "Enter") {
                  handleSaveEditedKeyword(topicIndex, termIndex);
                } else if (e.key === "Escape") {
                  setEditingTopicIndex(null);
                  setEditingKeywordIndex(null);
                }
              }}
              autoFocus
              className="bg-transparent text-xs text-foreground outline-none w-28"
            />
            <button
              onClick={function () {
                handleSaveEditedKeyword(topicIndex, termIndex);
              }}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>
        );
      } else {
        renderedKeywordChips.push(
          <div
            key={topicItem.label + "_chip_" + termIndex}
            className="group/chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border hover:border-border/80 text-xs text-foreground hover:bg-muted/40 transition-all select-none"
          >
            <span
              onClick={function () {
                setEditingTopicIndex(topicIndex);
                setEditingKeywordIndex(termIndex);
                setEditingKeywordText(termString);
              }}
              className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
              title="Click to edit keyword"
            >
              {termString}
            </span>
            <button
              onClick={function () {
                handleRemoveKeyword(topicIndex, termIndex);
              }}
              className="text-muted-foreground hover:text-red-500 opacity-60 group-hover/chip:opacity-100 transition-opacity"
              title="Delete keyword"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      }
    }

    const isAddingToThisTopic = topicAddingKeywordIndex === topicIndex;

    renderedTopicCards.push(
      <div
        key={topicItem.label + "_" + topicIndex}
        className="rounded-lg bg-card border border-border overflow-hidden space-y-3 p-4"
      >
        {/* Topic Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center text-xs font-bold font-mono">
              {topicIndex + 1}
            </span>
            <div>
              <h3 className="text-xs font-bold text-foreground">{topicItem.label}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-mono tracking-wider">
                {topicItem.category}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={function () {
                handleDeleteTopic(topicIndex);
              }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
              title="Delete topic"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Topic</span>
            </button>
          </div>
        </div>

        {/* News-Derived Boolean Query Banner */}
        {topicItem.boolean_query ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-md bg-muted/40 border border-border/80">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
                Boolean Query
              </span>
              <span className="text-xs font-mono text-foreground truncate select-all">
                {topicItem.boolean_query}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={function () {
                  navigator.clipboard.writeText(topicItem.boolean_query || "");
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Copy Boolean query"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
              <a
                href={"https://x.com/search?q=" + encodeURIComponent(topicItem.boolean_query) + "&f=live"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/30 transition-colors"
                title="Search Latest on X.com"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Test on X (&f=live)</span>
              </a>
            </div>
          </div>
        ) : null}

        {/* Keywords Chips Container */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {renderedKeywordChips}

          {/* Add Keyword Form / Button */}
          {isAddingToThisTopic ? (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-card border border-border">
              <input
                type="text"
                placeholder="Type keyword..."
                value={newKeywordInputText}
                onChange={function (e) {
                  setNewKeywordInputText(e.target.value);
                }}
                onKeyDown={function (e) {
                  if (e.key === "Enter") {
                    handleAddKeyword(topicIndex);
                  } else if (e.key === "Escape") {
                    setTopicAddingKeywordIndex(null);
                  }
                }}
                autoFocus
                className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-32"
              />
              <button
                onClick={function () {
                  handleAddKeyword(topicIndex);
                }}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={function () {
                  setTopicAddingKeywordIndex(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={function () {
                setTopicAddingKeywordIndex(topicIndex);
                setNewKeywordInputText("");
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-border hover:border-border/80 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors select-none cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Keyword</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-border/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>Synthesized Keywords</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {topicsList.length} topics generated · {totalTermsSum} total keywords. Click any chip to edit inline.
          </p>
        </div>

        {/* Export Dropdown / Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border/60 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border/60 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Topics List */}
      <div className="space-y-4">{renderedTopicCards}</div>
    </div>
  );
}
