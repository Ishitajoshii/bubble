import { useState, useRef, useEffect } from "react";

// ── SVG assets inlined ────────────────────────────────────────────────────────
const BubbleSmile = () => (
  <svg width="179" height="179" viewBox="0 0 179 179" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#clip0_smile)">
      <rect width="179" height="179" rx="89.5" fill="#A2E3F6"/>
      <path d="M156.244 101.486C147.573 116.332 143.317 136.408 149.998 140.31C156.679 144.212 171.722 123.48 173.694 99.7347C174.955 84.5441 171.858 64.9782 165.177 61.0766C158.496 57.175 164.914 86.6391 156.244 101.486Z" fill="white"/>
      <path d="M148.155 42.5957C156.088 51.3372 158.563 56.1309 160.695 54.766C164.91 52.0689 158.979 37.9684 148.272 29.3762C137.235 20.5195 133.602 23.171 132.002 26.9169C130.402 30.6629 140.222 33.8543 148.155 42.5957Z" fill="white"/>
      <path d="M138.725 91.7375C138.725 97.9162 133.716 89.5 127.537 89.5C121.359 89.5 116.35 97.9162 116.35 91.7375C116.35 85.5588 121.359 80.55 127.537 80.55C133.716 80.55 138.725 85.5588 138.725 91.7375Z" fill="#222222"/>
      <path d="M62.65 91.7375C62.65 97.9162 57.6412 89.5 51.4625 89.5C45.2838 89.5 40.275 97.9162 40.275 91.7375C40.275 85.5588 45.2838 80.55 51.4625 80.55C57.6412 80.55 62.65 85.5588 62.65 91.7375Z" fill="#222222"/>
    </g>
    <defs>
      <clipPath id="clip0_smile">
        <rect width="179" height="179" rx="89.5" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const BubbleStraight = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#clip0_straight)">
      <rect width="18" height="18" rx="9" fill="#A2E3F6"/>
      <path d="M15.7116 10.2053C14.8397 11.6982 14.4117 13.7171 15.0835 14.1094C15.7554 14.5017 17.268 12.417 17.4663 10.0292C17.5932 8.50166 17.2817 6.53413 16.6099 6.14179C15.9381 5.74945 16.5835 8.71233 15.7116 10.2053Z" fill="white"/>
      <path d="M14.8982 4.28341C15.6959 5.16244 15.9448 5.64449 16.1593 5.50724C16.5831 5.23602 15.9867 3.8181 14.91 2.95408C13.8002 2.06346 13.4348 2.33009 13.2739 2.70678C13.1131 3.08346 14.1005 3.40439 14.8982 4.28341Z" fill="white"/>
      <ellipse cx="5.17505" cy="8.325" rx="1.125" ry="1.575" fill="#222222"/>
      <ellipse cx="12.825" cy="8.325" rx="1.125" ry="1.575" fill="#222222"/>
    </g>
    <defs>
      <clipPath id="clip0_straight">
        <rect width="18" height="18" rx="9" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

// ── Icons ─────────────────────────────────────────────────────────────────────
const NewChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
    <polyline points="12 7 12 12 15 15"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);

const DatasetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);

const SqlIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────
type Mode = "Regular" | "Live";
type View = "home" | "chat";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}




// ── Components ────────────────────────────────────────────────────────────────

function PlusMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items = [
    { icon: <UploadIcon />, label: "Upload File", desc: "CSV, Parquet, JSON" },
    { icon: <DatasetIcon />, label: "Select Dataset", desc: "Built-in benchmark sets" },
    { icon: <SqlIcon />, label: "Run Raw SQL", desc: "Advanced direct execution" },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: "calc(100% + 12px)",
        left: 0,
        background: "rgba(30,22,35,0.97)",
        border: "1px solid rgba(251,144,176,0.25)",
        borderRadius: 14,
        padding: "8px 0",
        minWidth: 230,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        backdropFilter: "blur(12px)",
        zIndex: 100,
        animation: "menuIn 0.18s cubic-bezier(.22,1,.36,1)",
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "10px 16px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "#e0d0e8",
            textAlign: "left",
            transition: "background 0.15s",
            fontFamily: "'Aldrich'",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(251,144,176,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ color: "#FB90B0", flexShrink: 0 }}>{item.icon}</span>
          <span>
            <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.3 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: "#7a6a85", marginTop: 1 }}>{item.desc}</div>
          </span>
        </button>
      ))}
    </div>
  );
}

function Sidebar({
  onNew,
}: {
  onNew: () => void;
}) {
  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        background: "#1a1320",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 0",
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "0 20px 28px" }}>
        <span
          style={{
            fontFamily: "'Aldrich'",
            fontSize: 26,
            color: "#FB90B0",
            letterSpacing: 1,
            textShadow: "0 0 20px rgba(251,144,176,0.4)",
          }}
        >
          Bubble
        </span>
      </div>

      {/* Nav Items */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 12px" }}>
        {[
          { icon: <NewChatIcon />, label: "New Chat", action: onNew },
          { icon: <SearchIcon />, label: "Search Chats", action: () => {} },
          { icon: <HistoryIcon />, label: "History", action: () => {} },
        ].map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              background: "rgba(255,255,255,0.04)",
              border: "none",
              borderRadius: 10,
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "'Aldrich'",
              transition: "all 0.15s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(251,144,176,0.12)";
              e.currentTarget.style.color = "#FB90B0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              e.currentTarget.style.color = "#ffffff";
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>


    </aside>
  );
}

function InputBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask anything",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 740 }}>
      {menuOpen && <PlusMenu onClose={() => setMenuOpen(false)} />}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "rgba(255,255,255,0.04)",
          border: "1.5px solid #FB90B0",
          borderRadius: 999,
          padding: "6px 6px 6px 6px",
          boxShadow: "0 0 24px rgba(251,144,176,0.18), inset 0 0 0 1px rgba(255,255,255,0.03)",
          gap: 8,
        }}
      >
        {/* Plus button */}
        <button
          onClick={() => setMenuOpen((p) => !p)}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: menuOpen ? "rgba(251,144,176,0.25)" : "transparent",
            border: "1.5px solid #FB90B0",
            color: "#FB90B0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.15s",
            fontFamily: "'Aldrich'",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(251,144,176,0.2)")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = menuOpen ? "rgba(251,144,176,0.25)" : "transparent")
          }
        >
          <PlusIcon />
        </button>

        {/* Text input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e0d0e8",
            fontSize: 15,
            fontFamily: "inherit",
            caretColor: "#FB90B0",
          }}
        />

        {/* Send button */}
        {value.trim() && (
          <button
            onClick={onSubmit}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "#FB90B0",
              border: "none",
              color: "#1a1320",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.15s",
              fontFamily: "'Aldrich'",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#FB90B0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FB90B0")}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function HomeView({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
      setInput("");
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Radial glow behind bubble */}
      <div
        style={{
          position: "absolute",
          width: 340,
          height: 340,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(162,227,246,0.13) 0%, transparent 70%)",
          pointerEvents: "none",
          animation: "glowPulse 4s ease-in-out infinite",
        }}
      />

      {/* Floating Bubble */}
      <div
        style={{
          animation: "floatBubble 5s ease-in-out infinite",
          marginBottom: 28,
          filter: "drop-shadow(0 12px 32px rgba(162,227,246,0.35))",
        }}
      >
        <BubbleSmile />
      </div>

      {/* Greeting */}
      <p
        style={{
          color: "#c8b8d4",
          fontSize: 18,
          fontWeight: 500,
          marginBottom: 32,
          letterSpacing: 0.3,
          textAlign: "center",
        }}
      >
        Hello User, What do you wanna know today?
      </p>

      {/* Input */}
      <InputBar value={input} onChange={setInput} onSubmit={handleSubmit} />


    </div>
  );
}

function ChatView({
  messages,
  onSubmit,
  loading,
}: {
  messages: Message[];
  onSubmit: (prompt: string) => void;
  loading: boolean;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
      setInput("");
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-start",
              gap: 12,
              animation: "fadeUp 0.25s ease",
            }}
          >
            {msg.role === "assistant" && (
              <div style={{ flexShrink: 0, width: 32, height: 32, animation: "floatBubble 4s ease-in-out infinite" }}>
                <svg width="32" height="32" viewBox="0 0 179 179" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip_chat)">
                    <rect width="179" height="179" rx="89.5" fill="#A2E3F6"/>
                    <path d="M156.244 101.486C147.573 116.332 143.317 136.408 149.998 140.31C156.679 144.212 171.722 123.48 173.694 99.7347C174.955 84.5441 171.858 64.9782 165.177 61.0766C158.496 57.175 164.914 86.6391 156.244 101.486Z" fill="white"/>
                    <path d="M138.725 91.7375C138.725 97.9162 133.716 89.5 127.537 89.5C121.359 89.5 116.35 97.9162 116.35 91.7375C116.35 85.5588 121.359 80.55 127.537 80.55C133.716 80.55 138.725 85.5588 138.725 91.7375Z" fill="#222222"/>
                    <path d="M62.65 91.7375C62.65 97.9162 57.6412 89.5 51.4625 89.5C45.2838 89.5 40.275 97.9162 40.275 91.7375C40.275 85.5588 45.2838 80.55 51.4625 80.55C57.6412 80.55 62.65 85.5588 62.65 91.7375Z" fill="#222222"/>
                  </g>
                  <defs>
                    <clipPath id="clip_chat">
                      <rect width="179" height="179" rx="89.5" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              </div>
            )}
            <div
              style={{
                maxWidth: "66%",
                padding: "12px 18px",
                borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background:
                  msg.role === "user"
                    ? "rgba(251,144,176,0.12)"
                    : "rgba(255,255,255,0.05)",
                border:
                  msg.role === "user"
                    ? "1px solid rgba(251,144,176,0.35)"
                    : "1px solid rgba(255,255,255,0.08)",
                color: "#e0d0e8",
                fontSize: 14,
                lineHeight: 1.65,
                fontFamily: "inherit",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, animation: "floatBubble 4s ease-in-out infinite" }}>
              <BubbleStraight />
            </div>
            <div
              style={{
                padding: "12px 18px",
                borderRadius: "18px 18px 18px 4px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                gap: 5,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#FB90B0",
                    display: "inline-block",
                    animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: "16px 48px 28px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <InputBar value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="Ask a follow-up…" />
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<Mode>("Regular");
  const [view, setView] = useState<View>("home");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (prompt: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: prompt,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setView("chat");
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are Bubble, a friendly AI assistant for SwiftQuery — a fast approximate query engine. 
You help users understand data through natural language. When users ask data questions, explain how approximate sampling works,
mention strategies like stratified sampling or HyperLogLog when relevant, and be concise and helpful. Mode: ${mode}.`,
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: prompt },
          ],
        }),
      });

      const data = await res.json();
      const reply = data?.content?.[0]?.text ?? "Something went wrong. Please try again.";

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Oops! Couldn't reach the server. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setMessages([]);
    setView("home");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Pacifico&family=DM+Sans:wght@400;500;600;700&display=swap');

        @font-face {
          font-family: 'BD Caramel';
          src: url('/fonts/BD_Caramel.otf') format('opentype');
          font-weight: normal;
          font-style: normal;
        }

        @font-face {
          font-family: 'Aldrich';
          src: url('/fonts/Aldrich.ttf') format('truetype');
          font-weight: normal;
          font-style: normal;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: #1a1320;
          color: #e0d0e8;
          height: 100vh;
          overflow: hidden;
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(251,144,176,0.3); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(251,144,176,0.5); }

        @keyframes floatBubble {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1; transform: scale(1.08); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30%            { transform: translateY(-8px); }
        }
        @keyframes menuIn {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        input::placeholder { color: #5a4f65; }

        /* Noise texture overlay */
        #app-root::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.025;
          pointer-events: none;
          z-index: 9999;
        }
      `}</style>

      <div
        id="app-root"
        style={{
          display: "flex",
          height: "100vh",
          background: "linear-gradient(135deg, #1a1320 0%, #1e1428 50%, #1a1320 100%)",
          position: "relative",
        }}
      >
        <Sidebar onNew={handleNew} />

        {/* Main content */}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Mode buttons top-right */}
          <div
            style={{
              position: "absolute",
              top: 18,
              right: 24,
              display: "flex",
              gap: 10,
              zIndex: 20,
            }}
          >
            {(["Live", "Regular"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "7px 20px",
                  borderRadius: 999,
                  border: "1.5px solid",
                  borderColor: mode === m ? "#FB90B0" : "rgba(255,255,255,0.22)",
                  background: "transparent",
                  color: mode === m ? "#FB90B0" : "#9a8aaa",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Aldrich'",
                  letterSpacing: 0.3,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (mode !== m) {
                    e.currentTarget.style.borderColor = "rgba(251,144,176,0.5)";
                    e.currentTarget.style.color = "#e0d0e8";
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode !== m) {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
                    e.currentTarget.style.color = "#9a8aaa";
                  }
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {view === "home" ? (
            <HomeView onSubmit={handleSubmit} />
          ) : (
            <ChatView messages={messages} onSubmit={handleSubmit} loading={loading} />
          )}
        </main>
      </div>
    </>
  );
}
