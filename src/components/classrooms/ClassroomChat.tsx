"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { toast } from "@/components/Toasts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

type ChatMessage = {
  id: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: string;
};

export function ClassroomChat({ classroomId, currentUserId }: { classroomId: string; currentUserId: string }) {
  const endpoint = `/api/v1/classrooms/${encodeURIComponent(classroomId)}/chat`;
  const chat = useApi<ChatMessage[]>(endpoint);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void chat.refetch();
    };
    const interval = window.setInterval(refresh, 6000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [chat.refetch]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat.data]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    const result = await api.post<ChatMessage>(endpoint, { message: text });
    setBusy(false);
    if (!result.success) { toast.err(result.message); return; }
    chat.setData((current) => [...(current ?? []), result.data].slice(-100));
    setMessage("");
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display font-bold flex items-center gap-2"><MessageSquare size={17} className="text-primary" /> General chat</h2>
          <p className="text-xs text-muted mt-1">Messages are visible to active classroom members and teachers.</p>
        </div>
        <button className="btn btn-ghost !p-2" disabled={chat.loading} onClick={() => void chat.refetch()} aria-label="Refresh classroom chat">
          <RefreshCw size={14} />
        </button>
      </div>
      {chat.error && <p className="text-sm text-coral">{chat.error}</p>}
      <div ref={listRef} className="max-h-80 min-h-40 overflow-y-auto rounded-xl border border-line p-3 space-y-3">
        {chat.loading && !chat.data ? <p className="text-sm text-muted">Loading chat…</p>
          : chat.data?.length ? chat.data.map((item) => (
            <article key={item.id} className={`max-w-[90%] ${item.userId === currentUserId ? "ml-auto text-right" : ""}`}>
              <p className="text-[11px] text-muted">{item.userId === currentUserId ? "You" : item.userName} · {new Date(`${item.createdAt.replace(" ", "T")}Z`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
              <p className="mt-1 inline-block rounded-xl bg-surface px-3 py-2 text-sm text-left whitespace-pre-wrap break-words">{item.message}</p>
            </article>
          )) : <p className="text-sm text-muted">No messages yet. Start the conversation.</p>}
      </div>
      <form className="flex items-end gap-2" onSubmit={(event) => void send(event)}>
        <textarea className="input min-h-11 max-h-28 resize-y" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000}
          placeholder="Write a message…" aria-label="Chat message" rows={1} />
        <button className="btn btn-primary !px-3 !py-2.5" type="submit" disabled={busy || !message.trim()} aria-label="Send message">
          <Send size={14} /> {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
