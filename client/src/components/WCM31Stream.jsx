
import { useEffect, useRef, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function WCM31Stream() {
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("Hello Project V");
  const [status, setStatus] = useState("idle");
  const [events, setEvents] = useState([]);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const activeRef = useRef(null);

  useEffect(() => {
    return () => {
      activeRef.current?.controller.abort();
    };
  }, []);

  async function startStream() {
    if (activeRef.current || !prompt.trim() || !token.trim()) {
      return;
    }

    const task = {
      controller: new AbortController(),
      streamId: null,
      stopRequested: false
    };

    activeRef.current = task;
    setEvents([]);
    setOutput("");
    setError("");
    setStatus("streaming");

    try {
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`
        },
        body: JSON.stringify({ prompt }),
        signal: task.controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Streaming is unsupported");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let terminalEvent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");

        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const event = frame.match(/^event:\s*(.+)$/m)?.[1];
          const raw = frame.match(/^data:\s*(.+)$/m)?.[1];

          if (!event || !raw) continue;

          const data = JSON.parse(raw);

          if (event === "ready") {
            task.streamId = data.streamId;
          }

          if (task.stopRequested && event !== "cancelled") {
            continue;
          }

          setEvents(prev => [...prev, { event, data }]);

          if (event === "token") {
            setOutput(prev => prev + (data.content || ""));
          }

          if (event === "done") {
            terminalEvent = true;
            setStatus("completed");
          }

          if (event === "cancelled") {
            terminalEvent = true;
            setStatus("cancelled");
          }

          if (event === "error") {
            terminalEvent = true;
            setStatus("error");
            setError(data.code || "Stream failed");
          }
        }
      }

      if (!terminalEvent) {
        if (task.stopRequested) {
          setStatus("cancelled");
        } else {
          setStatus("error");
          setError("Stream closed unexpectedly");
        }
      }
    } catch (err) {
      if (task.stopRequested || err.name === "AbortError") {
        setStatus("cancelled");
      } else {
        setStatus("error");
        setError(err.message);
      }
    } finally {
      if (activeRef.current === task) {
        activeRef.current = null;
      }
    }
  }

  async function stopStream() {
    const task = activeRef.current;

    if (!task || task.stopRequested) return;

    task.stopRequested = true;
    setStatus("stopping");

    try {
      if (task.streamId) {
        const response = await fetch(
          `${API_URL}/api/chat/stream/${task.streamId}/cancel`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token.trim()}`
            },
            signal: AbortSignal.timeout(5000)
          }
        );

        if (!response.ok) {
          throw new Error(`Cancel HTTP ${response.status}`);
        }

        // Allow the stream to receive its cancelled event.
        return;
      }
    } catch (err) {
      setError(`Cancel request failed: ${err.message}`);
    }

    // If cancellation cannot be confirmed, disconnect.
    // The backend's close handler will abort its task.
    task.controller.abort();
  }

  const busy = ["streaming", "stopping"].includes(status);

  return (
    <div style={{
      maxWidth: 850,
      margin: "32px auto",
      padding: 24,
      fontFamily: "system-ui, sans-serif"
    }}>
      <h1>Project V – WCM-31</h1>
      <p>SSE Multi-Agent Streamer & AbortController</p>

      <p>
        <strong>Status:</strong> {status}
      </p>

      <label htmlFor="jwt">Development JWT</label>
      <input
        id="jwt"
        type="password"
        value={token}
        onChange={e => setToken(e.target.value)}
        placeholder="Paste local test JWT"
        autoComplete="off"
        style={{ display: "block", width: "100%", margin: "8px 0 16px" }}
      />

      <label htmlFor="prompt">Prompt</label>
      <textarea
        id="prompt"
        value={prompt}
        disabled={busy}
        onChange={e => setPrompt(e.target.value)}
        rows={3}
        style={{ display: "block", width: "100%", margin: "8px 0 16px" }}
      />

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={startStream}
          disabled={busy || !token.trim() || !prompt.trim()}
        >
          Send
        </button>

        <button
          onClick={stopStream}
          disabled={status !== "streaming"}
        >
          Stop
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: "crimson" }}>{error}</p>
      )}

      <h2>Agent Events</h2>
      <div style={{
        background: "#f3f4f6",
        color: "#111827",
        padding: 16,
        borderRadius: 8,
        minHeight: 100
      }}>
        {events.length === 0 && <p>No events yet.</p>}
        {events.map((item, index) => (
          <div key={index} style={{ marginBottom: 8 }}>
            <strong>{item.event}</strong>
            {" – "}
            {item.data.message ||
              item.data.agent ||
              item.data.status ||
              item.data.content ||
              ""}
          </div>
        ))}
      </div>

      <h2>Streaming Output</h2>
      <div style={{
        border: "1px solid #ccc",
        padding: 16,
        borderRadius: 8,
        whiteSpace: "pre-wrap",
        minHeight: 70
      }}>
        {output || "Waiting for output..."}
      </div>
    </div>
  );
}
