"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatHandle {
  send: (msg: string) => void;
}

interface ChatProps {
  variant: "full" | "panel";
  onNavigate?: (path: string) => void;
  onFirstMessage?: () => void;
  placeholder?: string;
  initialMessage?: string;
}

const Chat = forwardRef<ChatHandle, ChatProps>(function Chat(
  { variant, onNavigate, onFirstMessage, placeholder, initialMessage },
  ref
) {
  const [sessionId] = useState(() => {
    if (typeof window === "undefined") return "";
    const existing = sessionStorage.getItem("aurelia-session-id");
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("aurelia-session-id", id);
    return id;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSentRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setText("");

    if (!hasSentRef.current) {
      hasSentRef.current = true;
      onFirstMessage?.();
    }

    setMessages((m) => [...m, { role: "user", content: trimmed }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);

      if (data.navigateTo && onNavigate) {
        setTimeout(() => onNavigate(data.navigateTo), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({ send: sendMessage }));

  // Send initial message on mount
  useEffect(() => {
    if (initialMessage && !initialSentRef.current) {
      initialSentRef.current = true;
      sendMessage(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(text);
  };

  const isPanel = variant === "panel";

  return (
    <div className={`flex flex-col ${isPanel ? "h-full" : "max-w-2xl mx-auto w-full px-5 min-h-0 overflow-hidden"}`}>
      <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isPanel ? "px-4 pt-4 pb-2 space-y-3" : "pt-12 pb-4 space-y-6"}`}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] leading-relaxed ${
                isPanel ? "px-3.5 py-2.5" : "px-5 py-4"
              } ${
                msg.role === "user"
                  ? `bg-black text-white font-medium border border-black ${isPanel ? "text-sm" : "text-[17px]"}`
                  : `bg-white text-black border border-black ${isPanel ? "text-sm" : "text-[18px]"}`
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className={`bg-white border border-black ${isPanel ? "px-4 py-3" : "px-5 py-4"}`}>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p className={`text-sm text-black mb-2 ${isPanel ? "px-4" : "px-1"}`}>{error}</p>
      )}

      <form onSubmit={handleSubmit} className={`shrink-0 ${isPanel ? "px-4 pb-4 pt-2" : "pt-4 pb-6"}`}>
        <div className={`flex ${isPanel ? "gap-2" : "gap-3"} bg-white border border-black ${isPanel ? "py-2 pl-4 pr-2" : "py-3 pl-6 pr-3"}`}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder || "Tell me about your dietary preferences, or ask me to plan your meals..."}
            disabled={loading}
            className={`flex-1 bg-transparent px-2 py-2 text-black placeholder:text-black/50 ${isPanel ? "text-sm" : "text-base"} focus:outline-none disabled:opacity-60 min-w-0`}
          />
          <button
            type="submit"
            disabled={!text.trim() || loading}
            className={`border border-black bg-black hover:bg-white hover:text-black disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-all active:scale-[0.98] shrink-0 ${isPanel ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-base"}`}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
});

export default Chat;
