import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">YnAiUdan</div>
        <button className="new-chat">+ New chat</button>
        <nav>
          <a href="#conversations">Conversations</a>
          <a href="#projects">Projects</a>
          <a href="#tasks">Tasks</a>
          <a href="#files">Files</a>
          <a href="#integrations">Integrations</a>
          <a href="#settings">Settings</a>
        </nav>
      </aside>
      <main className="chat-area">
        <header>
          <span>YnAiUdan</span>
          <span className="status">Phase 1 foundation</span>
        </header>
        <section className="welcome">
          <h1>What can I help you build?</h1>
          <p>Chat, code, research, create, analyze, and execute authorized tasks.</p>
        </section>
        <div className="composer">
          <textarea placeholder="Message YnAiUdan..." rows={3} />
          <button>Send</button>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
