export function getDashboardHTML(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentSpawn Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      background: #0d1117;
      color: #c9d1d9;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    header h1 {
      font-size: 14px;
      font-weight: 600;
      color: #f0f6fc;
    }

    .ws-status {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: #21262d;
      color: #8b949e;
    }

    .ws-status.connected { background: #0d4429; color: #3fb950; }
    .ws-status.disconnected { background: #2d1b1b; color: #f85149; }

    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .sidebar {
      width: 240px;
      background: #161b22;
      border-right: 1px solid #30363d;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 10px 12px;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sidebar-header span {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #8b949e;
    }

    .btn-new {
      background: #238636;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
    }

    .btn-new:hover { background: #2ea043; }

    .session-list {
      flex: 1;
      overflow-y: auto;
    }

    .session-item {
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #21262d;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .session-item:hover { background: #21262d; }
    .session-item.active { background: #1c2128; border-left: 2px solid #58a6ff; }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.running { background: #3fb950; }
    .status-dot.stopped { background: #484f58; }
    .status-dot.crashed { background: #f85149; }

    .session-name {
      font-size: 12px;
      color: #c9d1d9;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-meta {
      font-size: 10px;
      color: #6e7681;
    }

    .btn-stop {
      background: transparent;
      border: 1px solid #6e7681;
      color: #6e7681;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 10px;
      cursor: pointer;
      font-family: inherit;
      flex-shrink: 0;
    }

    .btn-stop:hover { border-color: #f85149; color: #f85149; }

    .empty-state {
      padding: 20px 12px;
      font-size: 12px;
      color: #484f58;
      text-align: center;
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .content-header {
      padding: 10px 16px;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .session-title {
      font-size: 13px;
      font-weight: 600;
      color: #f0f6fc;
    }

    .session-dir {
      font-size: 11px;
      color: #6e7681;
    }

    .output-area {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .output-area .chunk-output { color: #c9d1d9; }
    .output-area .chunk-prompt { color: #58a6ff; font-weight: 600; }
    .output-area .chunk-divider {
      color: #30363d;
      margin: 8px 0;
      border: none;
      border-top: 1px solid #30363d;
    }

    .output-area .history-entry { margin-bottom: 12px; }
    .output-area .history-prompt { color: #58a6ff; font-weight: 600; margin-bottom: 4px; }
    .output-area .history-response { color: #c9d1d9; }
    .output-area .history-ts { font-size: 10px; color: #484f58; }

    .no-session {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      color: #484f58;
      font-size: 13px;
    }

    .prompt-bar {
      border-top: 1px solid #30363d;
      padding: 10px 16px;
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      background: #161b22;
    }

    .prompt-input {
      flex: 1;
      background: #0d1117;
      border: 1px solid #30363d;
      color: #c9d1d9;
      font-family: inherit;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 4px;
      outline: none;
      resize: none;
      min-height: 36px;
      max-height: 120px;
    }

    .prompt-input:focus { border-color: #58a6ff; }

    .btn-send {
      background: #1f6feb;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
      align-self: flex-end;
    }

    .btn-send:hover { background: #388bfd; }
    .btn-send:disabled { background: #21262d; color: #484f58; cursor: not-allowed; }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }

    .modal-overlay.open { display: flex; }

    .modal {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 20px;
      width: 380px;
      max-width: calc(100vw - 32px);
    }

    .modal h2 { font-size: 14px; margin-bottom: 14px; color: #f0f6fc; }

    .modal label {
      display: block;
      font-size: 11px;
      color: #8b949e;
      margin-bottom: 4px;
      margin-top: 10px;
    }

    .modal input, .modal select {
      width: 100%;
      background: #0d1117;
      border: 1px solid #30363d;
      color: #c9d1d9;
      font-family: inherit;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 4px;
      outline: none;
    }

    .modal input:focus, .modal select:focus { border-color: #58a6ff; }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .btn-cancel {
      background: transparent;
      border: 1px solid #30363d;
      color: #c9d1d9;
      border-radius: 4px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }

    .btn-cancel:hover { border-color: #8b949e; }

    .spinner {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 2px solid #30363d;
      border-top-color: #58a6ff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 6px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <header>
    <h1>AgentSpawn</h1>
    <span class="ws-status disconnected" id="ws-status">disconnected</span>
  </header>

  <div class="main">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span>Sessions</span>
        <button class="btn-new" id="btn-new-session">+ New</button>
      </div>
      <div class="session-list" id="session-list">
        <div class="empty-state">No sessions</div>
      </div>
    </aside>

    <div class="content" id="content">
      <div class="no-session" id="no-session">Select a session or create one</div>

      <div id="session-view" style="display:none; flex:1; flex-direction:column; overflow:hidden;">
        <div class="content-header">
          <div>
            <div class="session-title" id="view-name"></div>
            <div class="session-dir" id="view-dir"></div>
          </div>
          <span class="status-dot" id="view-status-dot" style="margin-left:auto;"></span>
        </div>
        <div class="output-area" id="output-area"></div>
        <div class="prompt-bar">
          <textarea class="prompt-input" id="prompt-input" placeholder="Send a prompt..." rows="1"></textarea>
          <button class="btn-send" id="btn-send">Send</button>
        </div>
      </div>
    </div>
  </div>

  <!-- New session modal -->
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <h2>New Session</h2>
      <label for="new-name">Name</label>
      <input type="text" id="new-name" placeholder="my-session" />
      <label for="new-dir">Working directory</label>
      <input type="text" id="new-dir" placeholder="/path/to/project" />
      <label for="new-perm">Permission mode</label>
      <select id="new-perm">
        <option value="bypassPermissions">bypassPermissions</option>
        <option value="acceptEdits">acceptEdits</option>
        <option value="default">default</option>
        <option value="plan">plan</option>
      </select>
      <div class="modal-actions">
        <button class="btn-cancel" id="btn-cancel">Cancel</button>
        <button class="btn-send" id="btn-create">Create</button>
      </div>
    </div>
  </div>

  <script>
    const PORT = ${port};
    const API = '';  // same origin

    let ws = null;
    let wsReconnectTimer = null;
    let selectedSession = null;
    let sessions = {};           // name -> sessionInfo
    let outputBuffers = {};      // name -> [{type,text}]
    let pendingSend = false;

    // ── WebSocket ─────────────────────────────────────────────────────────────

    function connectWS() {
      const url = 'ws://' + location.host + '/ws';
      ws = new WebSocket(url);

      ws.onopen = () => {
        setWsStatus('connected');
        clearTimeout(wsReconnectTimer);
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        handleWsMessage(msg);
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        wsReconnectTimer = setTimeout(connectWS, 3000);
      };

      ws.onerror = () => ws.close();
    }

    function setWsStatus(status) {
      const el = document.getElementById('ws-status');
      el.textContent = status;
      el.className = 'ws-status ' + status;
    }

    function handleWsMessage(msg) {
      if (msg.type === 'sessions') {
        // Full session list snapshot
        sessions = {};
        for (const s of msg.data) sessions[s.name] = s;
        renderSessionList();
        if (selectedSession && sessions[selectedSession]) {
          renderSessionHeader(sessions[selectedSession]);
        } else if (selectedSession && !sessions[selectedSession]) {
          selectedSession = null;
          showNoSession();
        }
      } else if (msg.type === 'sessionUpdate') {
        const s = msg.data;
        sessions[s.name] = s;
        renderSessionList();
        if (selectedSession === s.name) renderSessionHeader(s);
      } else if (msg.type === 'sessionRemoved') {
        delete sessions[msg.data];
        delete outputBuffers[msg.data];
        if (selectedSession === msg.data) {
          selectedSession = null;
          showNoSession();
        }
        renderSessionList();
      } else if (msg.type === 'output') {
        const { sessionName, chunk } = msg.data;
        if (!outputBuffers[sessionName]) outputBuffers[sessionName] = [];
        outputBuffers[sessionName].push({ type: 'output', text: chunk });
        if (selectedSession === sessionName) appendOutputChunk(chunk);
      } else if (msg.type === 'promptStart') {
        const { sessionName, prompt } = msg.data;
        if (!outputBuffers[sessionName]) outputBuffers[sessionName] = [];
        outputBuffers[sessionName].push({ type: 'prompt', text: prompt });
        if (selectedSession === sessionName) appendPromptMarker(prompt);
      }
    }

    // ── REST helpers ──────────────────────────────────────────────────────────

    async function fetchSessions() {
      const res = await fetch(API + '/api/sessions');
      if (!res.ok) return;
      const data = await res.json();
      sessions = {};
      for (const s of data) sessions[s.name] = s;
      renderSessionList();
    }

    async function createSession(name, workingDirectory, permissionMode) {
      const res = await fetch(API + '/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workingDirectory, permissionMode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert('Failed to create session: ' + (err.error || res.statusText));
        return;
      }
      await fetchSessions();
    }

    async function stopSession(name) {
      await fetch(API + '/api/sessions/' + encodeURIComponent(name), { method: 'DELETE' });
    }

    async function loadHistory(name) {
      const res = await fetch(API + '/api/sessions/' + encodeURIComponent(name) + '/history');
      if (!res.ok) return;
      const entries = await res.json();
      const area = document.getElementById('output-area');
      area.innerHTML = '';
      for (const entry of entries.slice().reverse()) {
        const div = document.createElement('div');
        div.className = 'history-entry';
        const ts = document.createElement('div');
        ts.className = 'history-ts';
        ts.textContent = new Date(entry.timestamp).toLocaleString();
        const prompt = document.createElement('div');
        prompt.className = 'history-prompt';
        prompt.textContent = '> ' + entry.prompt;
        const resp = document.createElement('div');
        resp.className = 'history-response';
        resp.textContent = entry.responsePreview;
        div.appendChild(ts);
        div.appendChild(prompt);
        div.appendChild(resp);
        area.appendChild(div);
      }
      // Append any live output buffered for this session
      if (outputBuffers[name]) {
        for (const item of outputBuffers[name]) {
          if (item.type === 'prompt') appendPromptMarker(item.text);
          else appendOutputChunk(item.text);
        }
      }
      area.scrollTop = area.scrollHeight;
    }

    async function sendPrompt(name, prompt) {
      const res = await fetch(API + '/api/sessions/' + encodeURIComponent(name) + '/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert('Error: ' + (err.error || res.statusText));
      }
    }

    // ── Render helpers ────────────────────────────────────────────────────────

    function renderSessionList() {
      const list = document.getElementById('session-list');
      const names = Object.keys(sessions);
      if (names.length === 0) {
        list.innerHTML = '<div class="empty-state">No sessions</div>';
        return;
      }
      list.innerHTML = '';
      for (const name of names) {
        const s = sessions[name];
        const item = document.createElement('div');
        item.className = 'session-item' + (name === selectedSession ? ' active' : '');
        item.dataset.name = name;

        const dot = document.createElement('span');
        dot.className = 'status-dot ' + s.state;

        const nameEl = document.createElement('span');
        nameEl.className = 'session-name';
        nameEl.textContent = name;

        const stopBtn = document.createElement('button');
        stopBtn.className = 'btn-stop';
        stopBtn.textContent = 'stop';
        stopBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await stopSession(name);
        });

        item.appendChild(dot);
        item.appendChild(nameEl);
        item.appendChild(stopBtn);

        item.addEventListener('click', () => selectSession(name));
        list.appendChild(item);
      }
    }

    function renderSessionHeader(s) {
      document.getElementById('view-name').textContent = s.name;
      document.getElementById('view-dir').textContent = s.workingDirectory;
      const dot = document.getElementById('view-status-dot');
      dot.className = 'status-dot ' + s.state;
    }

    function showNoSession() {
      document.getElementById('no-session').style.display = 'flex';
      document.getElementById('session-view').style.display = 'none';
    }

    function appendOutputChunk(text) {
      const area = document.getElementById('output-area');
      const span = document.createElement('span');
      span.className = 'chunk-output';
      span.textContent = text;
      area.appendChild(span);
      area.scrollTop = area.scrollHeight;
    }

    function appendPromptMarker(prompt) {
      const area = document.getElementById('output-area');
      const hr = document.createElement('hr');
      hr.className = 'chunk-divider';
      const div = document.createElement('div');
      div.className = 'chunk-prompt';
      div.textContent = '> ' + prompt;
      area.appendChild(hr);
      area.appendChild(div);
      area.scrollTop = area.scrollHeight;
    }

    async function selectSession(name) {
      selectedSession = name;
      const s = sessions[name];
      if (!s) return;

      document.getElementById('no-session').style.display = 'none';
      document.getElementById('session-view').style.display = 'flex';
      renderSessionHeader(s);
      renderSessionList();  // Update active state
      document.getElementById('output-area').innerHTML = '';
      await loadHistory(name);
      document.getElementById('prompt-input').focus();
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    document.getElementById('btn-new-session').addEventListener('click', () => {
      document.getElementById('new-name').value = '';
      document.getElementById('new-dir').value = '';
      document.getElementById('modal-overlay').classList.add('open');
      document.getElementById('new-name').focus();
    });

    document.getElementById('btn-cancel').addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.remove('open');
    });

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) {
        document.getElementById('modal-overlay').classList.remove('open');
      }
    });

    document.getElementById('btn-create').addEventListener('click', async () => {
      const name = document.getElementById('new-name').value.trim();
      const dir = document.getElementById('new-dir').value.trim();
      const perm = document.getElementById('new-perm').value;
      if (!name) { document.getElementById('new-name').focus(); return; }
      document.getElementById('modal-overlay').classList.remove('open');
      await createSession(name, dir || undefined, perm);
      if (sessions[name]) await selectSession(name);
    });

    document.getElementById('btn-send').addEventListener('click', async () => {
      if (!selectedSession || pendingSend) return;
      const input = document.getElementById('prompt-input');
      const prompt = input.value.trim();
      if (!prompt) return;
      input.value = '';
      input.style.height = '';
      pendingSend = true;
      document.getElementById('btn-send').disabled = true;
      await sendPrompt(selectedSession, prompt);
      pendingSend = false;
      document.getElementById('btn-send').disabled = false;
    });

    document.getElementById('prompt-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('btn-send').click();
      }
    });

    document.getElementById('prompt-input').addEventListener('input', function() {
      this.style.height = '';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // ── Init ──────────────────────────────────────────────────────────────────

    fetchSessions();
    connectWS();
  </script>
</body>
</html>`;
}
