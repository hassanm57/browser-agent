import { useState, useEffect } from "react";
import type { KeywordsData, KeywordTopicItem, TopicSourceReference } from "../types";
import { Tags, Plus, X, Trash2, Download, Check, Copy, ExternalLink, Globe, Newspaper, Flame } from "lucide-react";

function XLogoIcon(props: { className?: string }) {
  return (
    <svg className={props.className || "w-3 h-3 fill-current shrink-0"} viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GoogleLogoIcon(props: { className?: string }) {
  return (
    <svg className={props.className || "w-3 h-3 shrink-0"} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
    </svg>
  );
}

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

  // State for viewing all extracted sources in right-hand slide-over modal
  const [selectedTopicForSourcesModal, setSelectedTopicForSourcesModal] = useState<KeywordTopicItem | null>(null);
  const [copiedUrlString, setCopiedUrlString] = useState<string | null>(null);

  // Function to copy a source URL to clipboard
  function handleCopySourceUrl(urlToCopy: string) {
    navigator.clipboard.writeText(urlToCopy);
    setCopiedUrlString(urlToCopy);
    setTimeout(function () {
      setCopiedUrlString(null);
    }, 2000);
  }

  // Close sources modal on Escape key
  useEffect(function () {
    function handleKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape" && selectedTopicForSourcesModal !== null) {
        setSelectedTopicForSourcesModal(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return function () {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedTopicForSourcesModal]);

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
          terms: updatedTerms,
          source_headline: topicItem.source_headline,
          source_name: topicItem.source_name,
          source_url: topicItem.source_url,
          sources: topicItem.sources,
          specific_topics: topicItem.specific_topics
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
          terms: updatedTerms,
          source_headline: topicItem.source_headline,
          source_name: topicItem.source_name,
          source_url: topicItem.source_url,
          sources: topicItem.sources,
          specific_topics: topicItem.specific_topics
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
          terms: updatedTerms,
          source_headline: topicItem.source_headline,
          source_name: topicItem.source_name,
          source_url: topicItem.source_url,
          sources: topicItem.sources,
          specific_topics: topicItem.specific_topics
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

    // Collect all sources for this topic
    const topicSourcesList: TopicSourceReference[] = [];
    if (topicItem.sources && topicItem.sources.length > 0) {
      for (let sIndex = 0; sIndex < topicItem.sources.length; sIndex++) {
        topicSourcesList.push(topicItem.sources[sIndex]);
      }
    } else if (topicItem.source_headline || topicItem.source_url) {
      topicSourcesList.push({
        title: topicItem.source_headline || topicItem.label,
        source_name: topicItem.source_name || "Primary Source",
        url: topicItem.source_url || ""
      });
    }

    const isTopTrendingTopic = topicIndex < 3;

    renderedTopicCards.push(
      <div
        key={topicItem.label + "_" + topicIndex}
        className={
          isTopTrendingTopic
            ? "rounded-lg bg-amber-500/[0.04] dark:bg-amber-400/[0.03] border-2 border-amber-500/40 dark:border-amber-400/35 shadow-sm shadow-amber-500/10 overflow-hidden space-y-3 p-4 relative transition-all"
            : "rounded-lg bg-card border border-border overflow-hidden space-y-3 p-4 transition-all"
        }
      >
        {/* Topic Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <span
              className={
                isTopTrendingTopic
                  ? "w-7 h-7 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-black font-mono shadow-xs"
                  : "w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center text-xs font-bold font-mono"
              }
            >
              {topicIndex + 1}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-foreground">{topicItem.label}</h3>
                {isTopTrendingTopic ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full shadow-xs shrink-0">
                    <Flame className="w-3 h-3 fill-amber-500 text-amber-500 animate-pulse" />
                    Trending #{topicIndex + 1}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-mono tracking-wider">
                  {topicItem.category}
                </span>
                {topicSourcesList.length > 0 ? (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 truncate max-w-xs">
                    <Newspaper className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{topicSourcesList[0].source_name}{topicSourcesList.length > 1 ? " +" + (topicSourcesList.length - 1) + " more" : ""}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {topicSourcesList.length > 0 ? (
              <button
                onClick={function () {
                  setSelectedTopicForSourcesModal(topicItem);
                }}
                className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded border border-blue-500/25 transition-colors cursor-pointer"
                title="See all extracted website sources for this topic"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>See Sources ({topicSourcesList.length})</span>
              </button>
            ) : null}

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

        {/* News-Derived Query Banner */}
        {topicItem.boolean_query ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-md bg-muted/40 border border-border/80">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
                Query
              </span>
              <span className="text-xs font-mono text-foreground truncate select-all">
                {topicItem.boolean_query}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={function () {
                  navigator.clipboard.writeText(topicItem.boolean_query || "");
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Copy query"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
              <a
                href={"https://x.com/search?q=" + encodeURIComponent(topicItem.boolean_query) + "&f=live"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-neutral-900 hover:bg-black text-white dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-100 border border-neutral-700/60 shadow-xs transition-all cursor-pointer"
                title="Search Latest on X.com"
              >
                <XLogoIcon className="w-2.5 h-2.5 fill-current shrink-0" />
                <span>Test on X</span>
              </a>
              <a
                href={"https://www.google.com/search?q=" + encodeURIComponent(topicItem.boolean_query) + "&tbm=nws"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-400 shadow-xs transition-all cursor-pointer"
                title="Search Google News section"
              >
                <GoogleLogoIcon className="w-2.5 h-2.5 shrink-0" />
                <span>Test on Google</span>
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

  // Collect sources for the slide-over modal
  const modalSourcesList: TopicSourceReference[] = [];
  if (selectedTopicForSourcesModal !== null) {
    if (selectedTopicForSourcesModal.sources && selectedTopicForSourcesModal.sources.length > 0) {
      for (let sIndex = 0; sIndex < selectedTopicForSourcesModal.sources.length; sIndex++) {
        modalSourcesList.push(selectedTopicForSourcesModal.sources[sIndex]);
      }
    } else if (selectedTopicForSourcesModal.source_headline || selectedTopicForSourcesModal.source_url) {
      modalSourcesList.push({
        title: selectedTopicForSourcesModal.source_headline || selectedTopicForSourcesModal.label,
        source_name: selectedTopicForSourcesModal.source_name || "Primary Source",
        url: selectedTopicForSourcesModal.source_url || ""
      });
    }
  }

  const renderedModalSourceCards = [];
  for (let sIndex = 0; sIndex < modalSourcesList.length; sIndex++) {
    const sourceItem = modalSourcesList[sIndex];

    renderedModalSourceCards.push(
      <div
        key={"modal_source_card_" + sIndex + "_" + sourceItem.url}
        className="p-3.5 rounded-lg border border-border/80 bg-card hover:border-blue-500/40 transition-all space-y-2 group shadow-2xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-mono">
            #{sIndex + 1} · {sourceItem.source_name}
          </span>
          {sourceItem.url ? (
            <button
              onClick={function () {
                handleCopySourceUrl(sourceItem.url);
              }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Copy article URL"
            >
              {copiedUrlString === sourceItem.url ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          ) : null}
        </div>

        <h5 className="text-xs font-semibold text-foreground leading-snug">
          {sourceItem.title}
        </h5>

        {sourceItem.url ? (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
            <a
              href={sourceItem.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-mono hover:underline truncate max-w-full"
              title={sourceItem.url}
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{sourceItem.url}</span>
            </a>
          </div>
        ) : null}
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

      {/* Right-Hand Side Sources Slide-Over Modal */}
      {selectedTopicForSourcesModal !== null ? (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={function () {
              setSelectedTopicForSourcesModal(null);
            }}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md sm:max-w-lg bg-card border-l border-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
              
              {/* Modal Drawer Header */}
              <div className="p-5 border-b border-border/80 flex items-start justify-between gap-3 bg-muted/20">
                <div className="space-y-1.5 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      <Globe className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">Extracted Website Sources</h3>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    {selectedTopicForSourcesModal.label}
                  </p>
                  <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-mono tracking-wider">
                      {selectedTopicForSourcesModal.category}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-medium">
                      {modalSourcesList.length} {modalSourcesList.length === 1 ? "source" : "sources"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={function () {
                    setSelectedTopicForSourcesModal(null);
                  }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                  title="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Drawer Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {modalSourcesList.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground space-y-2">
                    <Newspaper className="w-6 h-6 mx-auto opacity-50" />
                    <p className="text-xs">No direct website URLs were linked to this topic.</p>
                  </div>
                ) : (
                  renderedModalSourceCards
                )}
              </div>

              {/* Modal Drawer Footer */}
              <div className="p-4 border-t border-border/80 bg-muted/10 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">Esc</kbd> to close
                </span>
                <button
                  onClick={function () {
                    setSelectedTopicForSourcesModal(null);
                  }}
                  className="px-3.5 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border/80 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
