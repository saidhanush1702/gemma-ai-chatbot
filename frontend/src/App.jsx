import { useEffect, useRef, useState } from "react";

/* Per-browser identity. Generated once, kept in localStorage, sent on every
   request — this is what stops two visitors to the deployed demo from sharing
   one memory. Not authentication: clearing site data starts a fresh identity. */
function getUserId() {
  let id = localStorage.getItem("gemma_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("gemma_user_id", id);
  }
  return id;
}

const api = (path, options = {}) =>
  fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": getUserId(),
      ...options.headers,
    },
  });

const SUGGESTIONS = [
  "Hi, I'm Sai Dhanush",
  "I live in Bangalore and work as a backend dev",
  "What's my name?",
  "Tell me a fun fact about space",
];

/* ---------------------------------- icons --------------------------------- */
const Icon = ({ d, className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const SendIcon = () => <Icon d="M5 12h14M13 6l6 6-6 6" className="w-5 h-5" />;
const TrashIcon = () => <Icon d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" className="w-3.5 h-3.5" />;
const CloseIcon = () => <Icon d="M18 6L6 18M6 6l12 12" className="w-5 h-5" />;
const BrainIcon = ({ className }) => (
  <Icon
    className={className}
    d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V17a3 3 0 0 0 6 0V8a3 3 0 0 0-2-3zM12 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8"
  />
);
const InfoIcon = ({ className }) => (
  <Icon className={className} d="M12 16v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
);

/* ---------------------------------- modal --------------------------------- */
/* 70% x 80% of the viewport on desktop, as asked. Widened on small screens so
   it stays usable on a phone. */
function Modal({ title, subtitle, icon, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop flex h-[85vh] w-[94vw] flex-col overflow-hidden rounded-2xl
                   border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60
                   md:h-[80vh] md:w-[70vw]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b
                           border-zinc-800/80 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                            bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
              {icon}
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="shrink-0 border-t border-zinc-800/80 px-6 py-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ sub-components ---------------------------- */
function FactCard({ label, value, onForget }) {
  return (
    <div className="group animate-pop relative rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-3 transition-colors hover:border-indigo-500/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/80">
        {label.replaceAll("_", " ")}
      </div>
      <div className="mt-0.5 break-words pr-6 text-sm text-zinc-100">{value}</div>
      <button
        onClick={onForget}
        title={`Forget ${label}`}
        className="absolute right-2 top-2 rounded-md p-1.5 text-zinc-600 opacity-0 transition
                   hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`animate-rise flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
          isUser
            ? "bg-zinc-800 text-zinc-300"
            : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20"
        }`}
      >
        {isUser ? "You" : "G"}
      </div>

      <div className={`flex max-w-[75%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
            isUser
              ? "rounded-tr-sm bg-indigo-600 text-white"
              : "rounded-tl-sm border border-zinc-800 bg-zinc-900/80 text-zinc-100"
          }`}
        >
          {msg.content}
        </div>

        {msg.learned && Object.keys(msg.learned).length > 0 && (
          <div className="animate-pop flex flex-wrap justify-end gap-1">
            {Object.entries(msg.learned).map(([k, v]) => (
              <span
                key={k}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5
                           text-[11px] font-medium text-emerald-300"
              >
                remembered · {k.replaceAll("_", " ")}: {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="animate-rise flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                      bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
        G
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-zinc-800
                      bg-zinc-900/80 px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function Feature({ n, title, children }) {
  return (
    <div className="flex gap-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                      bg-indigo-500/15 text-xs font-bold text-indigo-300">
        {n}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{children}</p>
      </div>
    </div>
  );
}

/* ----------------------------------- app ---------------------------------- */
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState({});
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(null); // "memory" | "info" | null

  const scrollRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    api("/health").then((r) => r.json()).then((d) => setModel(d.model)).catch(() => {});
    refreshMemory();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const refreshMemory = () =>
    api("/memory")
      .then((r) => r.json())
      .then((d) => setFacts(d.memory))
      .catch(() => setError("Backend not reachable — is uvicorn running on port 8010?"));

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;

    const history = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setBusy(true);
    setError("");
    if (taRef.current) taRef.current.style.height = "auto";

    try {
      const res = await api("/chat", {
        method: "POST",
        body: JSON.stringify({
          history: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setFacts(data.memory);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], learned: data.learned };
        return [...next, { role: "assistant", content: data.reply }];
      });
    } catch (e) {
      setError(`Request failed: ${e.message}. Is the backend running on port 8010?`);
    } finally {
      setBusy(false);
    }
  }

  const forget = (key) =>
    api(`/memory/${encodeURIComponent(key)}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((d) => setFacts(d.memory));

  const wipe = () =>
    api("/memory", { method: "DELETE" })
      .then((r) => r.json())
      .then((d) => setFacts(d.memory));

  const factCount = Object.keys(facts).length;

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0f] text-zinc-200">
      {/* ------------------------------- header ------------------------------ */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800/80
                         bg-zinc-950/40 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br
                          from-indigo-500 to-violet-600 text-sm font-bold text-white
                          shadow-lg shadow-indigo-500/20">
            G
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight text-zinc-100">Gemma Chatbot</h1>
            <p className="text-xs text-zinc-500">with long-term memory</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <code className="hidden rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1
                           text-[11px] text-zinc-400 sm:block">
            {model || "connecting…"}
          </code>

          <button
            onClick={() => setPanel("memory")}
            title="Long-term memory"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border
                       border-zinc-800 bg-zinc-900/60 text-zinc-400 transition
                       hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300"
          >
            <BrainIcon className="h-[18px] w-[18px]" />
            {factCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center
                               justify-center rounded-full bg-indigo-500 px-1 text-[10px]
                               font-bold text-white">
                {factCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setPanel("info")}
            title="About this chatbot"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800
                       bg-zinc-900/60 text-zinc-400 transition hover:border-indigo-500/50
                       hover:bg-indigo-500/10 hover:text-indigo-300"
          >
            <InfoIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* -------------------------------- chat ------------------------------- */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.length === 0 && (
            <div className="animate-rise pt-12 text-center sm:pt-16">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl
                              bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold
                              text-white shadow-xl shadow-indigo-500/25">
                G
              </div>
              <h2 className="text-xl font-semibold text-zinc-100">Tell me about yourself</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                Mention your name or anything personal, chat about whatever you like, then ask
                me to recall it later. It will still be there.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-zinc-800 bg-zinc-900/50 px-3.5 py-1.5
                               text-[13px] text-zinc-400 transition hover:border-indigo-500/50
                               hover:bg-indigo-500/10 hover:text-indigo-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => <Bubble key={i} msg={m} />)}
          {busy && <Typing />}

          {error && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------ composer ----------------------------- */}
      <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/40 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-zinc-800
                        bg-zinc-900/70 p-2 transition focus-within:border-indigo-500/60">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            disabled={busy}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Say something…  (Shift+Enter for a new line)"
            className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-[15px]
                       text-zinc-100 placeholder-zinc-600 outline-none disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                       bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg
                       shadow-indigo-500/25 transition hover:brightness-110
                       disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-zinc-600">
          Every reply is generated with your stored facts prepended to the prompt.
        </p>
      </div>

      {/* ---------------------------- memory modal --------------------------- */}
      {panel === "memory" && (
        <Modal
          title="Long-term memory"
          subtitle={`${factCount} ${factCount === 1 ? "fact" : "facts"} remembered about you`}
          icon={<BrainIcon className="h-[18px] w-[18px]" />}
          onClose={() => setPanel(null)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  setMessages([]);
                  setPanel(null);
                }}
                className="rounded-lg border border-zinc-800 px-3.5 py-2 text-xs font-medium
                           text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
              >
                Clear chat · keep memory
              </button>
              <button
                onClick={wipe}
                disabled={factCount === 0}
                className="rounded-lg border border-red-900/50 bg-red-950/30 px-3.5 py-2 text-xs
                           font-medium text-red-400 transition hover:bg-red-950/60
                           disabled:cursor-not-allowed disabled:opacity-40"
              >
                Wipe memory ({factCount})
              </button>
            </div>
          }
        >
          <p className="mb-5 text-[13px] leading-relaxed text-zinc-400">
            These facts are stored in Postgres and re-injected into <em>every</em> prompt, so
            recall never depends on the context window. This is exactly what the model is told
            about you before it answers.
          </p>

          {factCount === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-16 text-center">
              <p className="text-sm text-zinc-500">Nothing remembered yet.</p>
              <p className="mt-1 text-xs text-zinc-600">
                Try saying &ldquo;I'm Sai Dhanush&rdquo; in the chat.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(facts).map(([k, v]) => (
                <FactCard key={k} label={k} value={v} onForget={() => forget(k)} />
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ----------------------------- info modal ---------------------------- */}
      {panel === "info" && (
        <Modal
          title="About this chatbot"
          subtitle="What it does, and how it manages to remember"
          icon={<InfoIcon className="h-[18px] w-[18px]" />}
          onClose={() => setPanel(null)}
        >
          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-zinc-100">What it's built for</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                A chatbot that genuinely remembers you. Tell it your name, talk about anything
                else for as long as you like, then ask &ldquo;what's my name?&rdquo; — it answers
                correctly. Not because the conversation still fits in the model's context window,
                but because the fact was extracted, stored in a database, and re-injected into
                every prompt since.
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-zinc-100">Main features</h3>
              <div className="space-y-3">
                <Feature n="1" title="Long-term memory that outlives the conversation">
                  Every message is scanned by a second model call that pulls out durable facts
                  as JSON — name, city, job, anything lasting. Those go to Postgres, not the
                  chat history. Turn 500 recalls just as reliably as turn 2, and the memory
                  survives a page refresh, a server restart, and a reboot.
                </Feature>
                <Feature n="2" title="Per-user session memory">
                  Your browser generates a private ID on first visit and sends it with every
                  request. All memory is scoped to that ID, so two people using this app never
                  see each other's facts — each gets their own separate memory.
                </Feature>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-zinc-100">How a single turn works</h3>
              <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
                <pre className="text-[12px] leading-relaxed text-zinc-400">{`your message
   ├─►  EXTRACTOR  ──►  {"name": "Sai Dhanush"}  ──►  Postgres
   └─►  CHAT       ──►  reply, with all stored facts prepended`}</pre>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                Both calls run concurrently, which roughly halves the wait per turn.
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-zinc-100">Model &amp; stack</h3>
              <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                {[
                  ["Model", model || "loading…"],
                  ["Provider", "Google AI Studio (free tier)"],
                  ["Backend", "FastAPI · Python"],
                  ["Memory store", "Postgres (Neon)"],
                  ["Frontend", "React + Tailwind CSS"],
                  ["Hosting", "Vercel"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-3 rounded-lg border
                               border-zinc-800/80 bg-zinc-900/40 px-3 py-2"
                  >
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="text-right font-medium text-zinc-200">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
}
