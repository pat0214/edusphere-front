"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, MessageCircleQuestion, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";

type TutorMode = "learning" | "debugging" | "review";
type TutorAction = "hint" | "error" | "concept" | "pseudocode" | "solution";
type TutorMessage = { role: "user" | "assistant"; text: string };
type TutorHistory = { action: TutorAction; mode: TutorMode; credits: number; status: string; createdAt: string };
type TutorCredits = {
  enabled: boolean;
  credits: { dailyLimit: number; used: number; remaining: number; costs: Record<TutorAction, number> };
  history: TutorHistory[];
};
type TutorResponse = { reply: string; remaining: number; charged: boolean; duplicate: boolean; hintLevel: number | null };
type RequestPayload = {
  requestId: string;
  mode: TutorMode;
  action: TutorAction;
  message: string;
  history: TutorMessage[];
  exerciseId?: string;
  language: string;
  code: string;
  compilerError: string;
  testResults: { passed: boolean; actual: string; log: string[]; hidden: boolean }[];
};

const actionLabels: Record<TutorAction, string> = {
  hint: "Ask for a hint",
  error: "Explain an error",
  concept: "Explain a concept",
  pseudocode: "Generate pseudocode",
  solution: "Complete solution",
};
const defaultPrompts: Record<TutorAction, string> = {
  hint: "Give me the next hint for this exercise.",
  error: "Help me understand the error or failed test and suggest a focused correction.",
  concept: "Explain the programming concept I need for this exercise.",
  pseudocode: "Show me pseudocode for an approach, but not the finished implementation.",
  solution: "Show me a complete solution and explain it line by line.",
};
const modeLabels: Record<TutorMode, string> = {
  learning: "Learning",
  debugging: "Debugging",
  review: "Review",
};
const hintTitles = ["Understanding", "Problem-solving approach", "Guided implementation"];

function tutorReply(response: TutorResponse, request: RequestPayload): string {
  const title = request.mode === "learning" && request.action === "hint" && response.hintLevel
    ? `Hint ${response.hintLevel} · ${hintTitles[response.hintLevel - 1]}`
    : "";
  return title ? `${title}\n\n${response.reply}` : response.reply;
}

export function PlaygroundTutor({
  open,
  onClose,
  exercise,
  language,
  code,
  compilerError,
  testResults,
  onInsertCode,
}: {
  open: boolean;
  onClose: () => void;
  exercise: { id: string; title: string; prompt: string } | null;
  language: string;
  code: string;
  compilerError: string;
  testResults: RequestPayload["testResults"];
  onInsertCode: (code: string) => void;
}) {
  const [mode, setMode] = useState<TutorMode>("learning");
  const [action, setAction] = useState<TutorAction>("hint");
  const [credits, setCredits] = useState<TutorCredits | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<RequestPayload | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const updateCredits = (response: TutorResponse, request: RequestPayload) => {
    setCredits((current) => current ? {
      ...current,
      credits: { ...current.credits, remaining: response.remaining },
      history: response.charged ? [{
        action: request.action,
        mode: request.mode,
        credits: current.credits.costs[request.action],
        status: "succeeded",
        createdAt: new Date().toISOString(),
      }, ...current.history].slice(0, 20) : current.history,
    } : current);
    if (!response.charged) {
      void api.get<TutorCredits>("/api/v1/ai-tutor/credits").then((result) => {
        if (result.success) setCredits(result.data);
      });
    }
  };

  useEffect(() => {
    let active = true;
    void api.get<TutorCredits>("/api/v1/ai-tutor/credits").then((response) => {
      if (active && response.success) setCredits(response.data);
      else if (active) setError(response.message);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const submit = async (event?: FormEvent, requestedAction?: TutorAction) => {
    event?.preventDefault();
    if (busy) return;
    const selectedAction = requestedAction ?? action;
    const message = draft.trim() || defaultPrompts[selectedAction];
    if (retry) {
      setBusy(true);
      setError("");
      const response = await api.post<TutorResponse>("/api/v1/ai-tutor/chat", retry);
      setBusy(false);
      if (!response.success) { setError(response.message); return; }
      setMessages((items) => [...items, { role: "assistant", text: tutorReply(response.data, retry) }]);
      updateCredits(response.data, retry);
      setRetry(null);
      setDraft("");
      return;
    }

    const payload: RequestPayload = {
      requestId: crypto.randomUUID(),
      mode,
      action: selectedAction,
      message,
      history: messages.slice(-8),
      ...(exercise ? { exerciseId: exercise.id } : {}),
      language,
      code: code.slice(0, 20000),
      compilerError,
      testResults: testResults.filter((result) => !result.hidden).slice(0, 10),
    };
    setMessages((items) => [...items, { role: "user", text: message }]);
    setBusy(true);
    setError("");
    const response = await api.post<TutorResponse>("/api/v1/ai-tutor/chat", payload);
    setBusy(false);
    if (!response.success) {
      setRetry(payload);
      setError(response.message);
      return;
    }
    setMessages((items) => [...items, { role: "assistant", text: tutorReply(response.data, payload) }]);
    updateCredits(response.data, payload);
    setRetry(null);
    setDraft("");
  };

  const requestAction = (nextAction: TutorAction) => {
    setAction(nextAction);
    void submit(undefined, nextAction);
  };

  const insertCode = (text: string) => {
    const snippet = text.match(/```[^\n]*\n([\s\S]*?)```/)?.[1]?.trim();
    if (!snippet) return;
    if (window.confirm("Replace your current editor contents with this suggested code?")) onInsertCode(snippet);
  };

  return (
    <aside
      aria-label="AI Learning Assistant"
      aria-hidden={!open}
      className={`fixed z-[80] right-3 top-3 bottom-3 w-[min(430px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[#303858] bg-[#0d1024] text-[#e7eaff] shadow-2xl transition-transform duration-200 md:right-5 md:top-5 md:bottom-5 ${open ? "visible translate-x-0" : "invisible translate-x-[calc(100%+2rem)] pointer-events-none"}`}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-[#262d4a] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl bg-primary/20 p-2 text-primary"><Sparkles size={17} /></span>
            <div>
              <h2 className="font-semibold">AI Learning Assistant</h2>
              <p className="mt-0.5 text-[11px] text-[#9299bd]">{exercise?.title ?? "Free practice"} · {language}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#aeb4d1] hover:bg-[#202746]" aria-label="Close assistant">
            <X size={17} />
          </button>
        </header>

        <div className="border-b border-[#262d4a] px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#afb5d0]">Daily AI credits</span>
            <strong className="font-mono text-[#f3b4a7]">
              {credits ? `${credits.credits.remaining} / ${credits.credits.dailyLimit} left` : "Loading…"}
            </strong>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#252b47]">
            <div
              className="h-full rounded-full bg-[#ee8b7b] transition-[width]"
              style={{ width: `${credits ? (credits.credits.dailyLimit ? (credits.credits.remaining / credits.credits.dailyLimit) * 100 : 0) : 0}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[#171d35] p-1">
            {(Object.keys(modeLabels) as TutorMode[]).map((value) => (
              <button key={value} type="button" onClick={() => setMode(value)}
                className={`rounded-lg px-2 py-1.5 text-xs ${mode === value ? "bg-[#303858] text-white" : "text-[#9299bd] hover:text-white"}`}>
                {modeLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="rounded-xl border border-[#282f4f] bg-[#141a30] p-4 text-sm leading-relaxed text-[#c5cbe1]">
              {credits?.enabled === false
                ? "The AI assistant is temporarily disabled."
                : "I can help you understand the task, plan an approach, or debug your code. I’ll guide you instead of taking over your work."}
              {exercise && <p className="mt-3 text-xs text-[#8f97ba]">{exercise.prompt}</p>}
            </div>
          )}
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div key={`${index}-${message.role}`} className={`rounded-xl px-3.5 py-3 text-sm leading-relaxed ${message.role === "user" ? "ml-8 bg-[#34304b] text-[#f1effb]" : "mr-3 border border-[#252d49] bg-[#151b32] text-[#d5daf0]"}`}>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                {message.role === "assistant" && message.text.includes("```") && (
                  <button type="button" onClick={() => insertCode(message.text)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#57618b] px-2.5 py-1.5 text-xs text-[#dce1ff] hover:bg-[#252d49]">
                    Insert suggested code…
                  </button>
                )}
              </div>
            ))}
            {busy && <div className="mr-3 flex items-center gap-2 rounded-xl border border-[#252d49] bg-[#151b32] px-3.5 py-3 text-xs text-[#aeb5d4]">
              <LoaderCircle size={14} className="animate-spin" /> Thinking through this with you…
            </div>}
            <div ref={messagesEnd} />
          </div>
        </div>

        <div className="border-t border-[#262d4a] px-4 py-3">
          {!credits?.enabled && credits && <p className="mb-2 text-xs text-amber-300">The assistant is disabled by an administrator.</p>}
          {error && <div role="alert" className="mb-2 rounded-lg border border-[#8f2d3a]/60 bg-[#35121a]/50 px-3 py-2 text-xs text-[#ffabb0]">
            {error}
            {retry && <button type="button" disabled={busy} onClick={() => void submit()} className="ml-2 underline underline-offset-2">Retry safely</button>}
          </div>}
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {(Object.keys(actionLabels) as TutorAction[]).map((value) => {
              const cost = credits?.credits.costs[value];
              return (
                <button key={value} type="button" disabled={busy || !!retry || credits?.enabled === false
                  || (!!credits && credits.credits.remaining < (credits.credits.costs[value] ?? 0))}
                  onClick={() => requestAction(value)}
                  className={`shrink-0 rounded-lg border px-2 py-1.5 text-[10px] ${action === value ? "border-[#717aa7] bg-[#292f4c] text-white" : "border-[#303858] text-[#a5accb] hover:bg-[#1b223b]"} disabled:opacity-40`}>
                  {actionLabels[value]}{cost !== undefined ? ` · ${cost} credit${cost === 1 ? "" : "s"}` : ""}
                </button>
              );
            })}
          </div>
          {credits && credits.credits.remaining < (credits.credits.costs[action] ?? 0) && (
            <p role="status" className="mb-2 text-xs text-amber-300">
              Not enough credits for {actionLabels[action].toLowerCase()}. Credits replenish daily.
            </p>
          )}
          <form id="playground-tutor-form" onSubmit={(event) => void submit(event)} className="flex items-end gap-2">
            <label className="sr-only" htmlFor="playground-tutor-message">Ask a programming question</label>
            <textarea id="playground-tutor-message" value={draft} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }}
              maxLength={1200} rows={2} placeholder="Ask a programming question…" disabled={busy || credits?.enabled === false}
              className="min-h-11 flex-1 resize-none rounded-xl border border-[#303858] bg-[#11172c] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#777f9f] focus:border-[#777fa7] disabled:opacity-50" />
            <button type="submit" disabled={busy || credits?.enabled === false || (!!credits && credits.credits.remaining < (credits.credits.costs[action] ?? 0))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ec8d7e] text-[#211827] transition-colors hover:bg-[#f5a090] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send question">
              <Send size={16} />
            </button>
          </form>
          {credits && <details className="mt-2 text-[10px] text-[#858dac]">
            <summary className="cursor-pointer">Recent AI usage</summary>
            <div className="mt-2 space-y-1">
              {credits.history.slice(0, 5).map((entry, index) => (
                <p key={`${entry.createdAt}-${index}`} className="flex justify-between gap-2">
                  <span>{actionLabels[entry.action]} · {entry.status}</span>
                  <span>{entry.status === "succeeded" ? `${entry.credits} credits` : entry.status === "failed" ? "refunded" : "pending"}</span>
                </p>
              ))}
              {credits.history.length === 0 && <p>No AI requests yet. Code execution remains free.</p>}
            </div>
          </details>}
          <p className="mt-2 flex items-center gap-1 text-[10px] text-[#747c9d]"><MessageCircleQuestion size={11} /> Your code and exercise context are sent to the server-side AI provider.</p>
        </div>
      </div>
    </aside>
  );
}
