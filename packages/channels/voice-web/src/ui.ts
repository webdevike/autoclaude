export const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="rt-model" content="gpt-4o-realtime-preview">
  <title>Jarvis</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300;1,9..40,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --amber: #d4a54a;
      --amber-dim: rgba(212, 165, 74, 0.15);
      --amber-glow: rgba(212, 165, 74, 0.4);
      --surface: #161618;
      --surface-raised: #1c1c1f;
      --surface-overlay: #222225;
      --text-primary: #e8e4dd;
      --text-secondary: #8a857d;
      --text-muted: #5c584f;
      --danger: #c45c4a;
      --danger-hover: #b34d3c;
      --radius: 16px;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html { height: 100%; }

    body {
      font-family: 'DM Sans', sans-serif;
      background: #111113;
      color: var(--text-primary);
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow: hidden;
    }

    /* ---- Grain overlay ---- */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 9999;
      pointer-events: none;
      opacity: 0.025;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      background-size: 128px 128px;
    }

    /* ---- Ambient gradient ---- */
    body::after {
      content: '';
      position: fixed;
      top: -30%;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, var(--amber-dim) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
      transition: opacity 0.8s ease;
    }

    body.connected::after {
      opacity: 1;
      background: radial-gradient(circle, rgba(212, 165, 74, 0.08) 0%, transparent 70%);
    }

    #app {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 480px;
      height: 100vh;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      padding: 0 20px;
    }

    /* ---- Header ---- */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 0 0;
      flex-shrink: 0;
    }

    .header h1 {
      font-family: 'Instrument Serif', serif;
      font-size: 28px;
      font-weight: 400;
      font-style: italic;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 400;
      color: var(--text-muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
      transition: all 0.5s ease;
    }

    .status-dot.connected {
      background: var(--amber);
      box-shadow: 0 0 10px var(--amber-glow);
    }

    .status-dot.connecting {
      background: var(--amber);
      animation: breathe 2s ease-in-out infinite;
    }

    @keyframes breathe {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.35; transform: scale(0.85); }
    }

    /* ---- Orb / Visualizer ---- */
    .orb-area {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 36px 0 20px;
      transition: padding 0.4s ease;
    }

    .orb-area.active { padding: 28px 0 16px; }

    .orb-wrapper {
      position: relative;
      width: 140px;
      height: 140px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .orb-wrapper:hover .orb-ring {
      transform: scale(1.04);
    }

    .orb-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 1.5px solid var(--text-muted);
      transition: all 0.5s ease, transform 0.25s ease;
    }

    .orb-ring.active {
      border-color: var(--amber);
      box-shadow:
        0 0 30px rgba(212, 165, 74, 0.15),
        inset 0 0 30px rgba(212, 165, 74, 0.05);
    }

    .orb-ring.connecting {
      border-color: var(--amber);
      animation: orb-pulse 2s ease-in-out infinite;
    }

    @keyframes orb-pulse {
      0%, 100% {
        box-shadow: 0 0 20px rgba(212, 165, 74, 0.1);
        transform: scale(1);
      }
      50% {
        box-shadow: 0 0 40px rgba(212, 165, 74, 0.25);
        transform: scale(1.03);
      }
    }

    canvas#visualizer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }

    .orb-label {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-top: 16px;
      text-align: center;
      transition: color 0.4s ease;
      font-weight: 400;
    }

    .orb-label.active { color: var(--amber); }

    /* ---- Listening pill ---- */
    .listening-pill {
      display: none;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 6px 14px;
      border-radius: 20px;
      background: var(--amber-dim);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--amber);
    }

    .listening-pill.visible { display: flex; }

    .listening-pill .pip {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--amber);
      animation: pip-bounce 1.1s ease-in-out infinite;
    }
    .listening-pill .pip:nth-child(2) { animation-delay: 0.14s; }
    .listening-pill .pip:nth-child(3) { animation-delay: 0.28s; }

    @keyframes pip-bounce {
      0%, 100% { transform: translateY(0); opacity: 0.5; }
      50% { transform: translateY(-3px); opacity: 1; }
    }

    /* ---- Transcript ---- */
    .transcript-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 4px 0 20px;
      scroll-behavior: smooth;
      mask-image: linear-gradient(to bottom, transparent 0%, black 3%, black 92%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 3%, black 92%, transparent 100%);
    }

    .transcript-area::-webkit-scrollbar { width: 3px; }
    .transcript-area::-webkit-scrollbar-track { background: transparent; }
    .transcript-area::-webkit-scrollbar-thumb {
      background: var(--text-muted);
      border-radius: 3px;
    }

    .transcript-empty {
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      padding: 32px 0;
      font-style: italic;
      font-family: 'Instrument Serif', serif;
      letter-spacing: 0.01em;
    }

    .message {
      margin-bottom: 16px;
      animation: msg-in 0.3s ease;
    }

    .message:last-child { margin-bottom: 0; }

    .message-label {
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .message.user .message-label { color: var(--text-secondary); }
    .message.ai .message-label { color: var(--amber); opacity: 0.7; }

    .message-text {
      font-size: 15px;
      line-height: 1.65;
      color: var(--text-primary);
      word-wrap: break-word;
    }

    .message.user .message-text {
      color: var(--text-secondary);
    }

    @keyframes msg-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ---- Tool indicator ---- */
    .tool-indicator {
      margin-bottom: 16px;
      padding: 10px 14px;
      border-radius: 10px;
      background: var(--surface-raised);
      border-left: 2px solid var(--amber);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: msg-in 0.3s ease;
      color: var(--text-secondary);
      font-size: 13px;
    }

    .tool-spinner {
      width: 14px;
      height: 14px;
      border: 1.5px solid rgba(212, 165, 74, 0.2);
      border-top-color: var(--amber);
      border-radius: 50%;
      animation: tool-spin 0.9s linear infinite;
    }

    @keyframes tool-spin {
      to { transform: rotate(360deg); }
    }

    /* ---- Bottom safe area ---- */
    .bottom-pad {
      flex-shrink: 0;
      height: env(safe-area-inset-bottom, 12px);
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="header">
      <h1>Jarvis</h1>
      <div class="status-badge">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Idle</span>
      </div>
    </div>

    <div class="orb-area" id="orbArea">
      <div class="orb-wrapper" id="orbWrapper" onclick="toggleConnection()">
        <div class="orb-ring" id="orbRing"></div>
        <canvas id="visualizer"></canvas>
      </div>
      <div class="orb-label" id="orbLabel">Tap to begin</div>
      <div class="listening-pill" id="listeningPill">
        <div class="pip"></div>
        <div class="pip"></div>
        <div class="pip"></div>
        <span>Listening</span>
      </div>
    </div>

    <div class="transcript-area" id="transcriptArea">
      <div class="transcript-empty" id="emptyState">
        Your conversation will appear here.
      </div>
    </div>

    <div class="bottom-pad"></div>
  </div>

  <script>
    const MODEL = document.querySelector('meta[name="rt-model"]')?.content || 'gpt-4o-realtime-preview';

    let pc = null;
    let dc = null;
    let localStream = null;
    let audioCtx = null;
    let analyser = null;
    let animFrameId = null;
    let currentAiMessageEl = null;
    let currentAiText = '';
    let state = 'disconnected';

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const orbArea = document.getElementById('orbArea');
    const orbWrapper = document.getElementById('orbWrapper');
    const orbRing = document.getElementById('orbRing');
    const orbLabel = document.getElementById('orbLabel');
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const listeningPill = document.getElementById('listeningPill');
    const transcriptArea = document.getElementById('transcriptArea');
    const emptyState = document.getElementById('emptyState');

    function setState(newState) {
      state = newState;
      statusDot.className = 'status-dot' + (newState !== 'disconnected' ? ' ' + newState : '');

      if (newState === 'disconnected') {
        document.body.classList.remove('connected');
        statusText.textContent = 'Idle';
        orbRing.className = 'orb-ring';
        orbLabel.textContent = 'Tap to begin';
        orbLabel.className = 'orb-label';
        orbArea.className = 'orb-area';
        listeningPill.classList.remove('visible');
      } else if (newState === 'connecting') {
        statusText.textContent = 'Connecting';
        orbRing.className = 'orb-ring connecting';
        orbLabel.textContent = 'Connecting...';
        orbLabel.className = 'orb-label';
      } else if (newState === 'connected') {
        document.body.classList.add('connected');
        statusText.textContent = 'Live';
        orbRing.className = 'orb-ring active';
        orbLabel.textContent = 'Tap to end';
        orbLabel.className = 'orb-label active';
        orbArea.className = 'orb-area active';
      }
    }

    function addMessage(role, text) {
      if (emptyState) emptyState.remove();

      const msg = document.createElement('div');
      msg.className = 'message ' + (role === 'user' ? 'user' : 'ai');

      const label = document.createElement('div');
      label.className = 'message-label';
      label.textContent = role === 'user' ? 'You' : 'Jarvis';

      const body = document.createElement('div');
      body.className = 'message-text';
      body.textContent = text;

      msg.appendChild(label);
      msg.appendChild(body);

      /* If this is a user message and Jarvis is already streaming,
         insert the user message before Jarvis's current message */
      const aiParent = currentAiMessageEl ? currentAiMessageEl.closest('.message') : null;
      if (role === 'user' && aiParent && aiParent.parentNode === transcriptArea) {
        transcriptArea.insertBefore(msg, aiParent);
      } else {
        transcriptArea.appendChild(msg);
      }
      transcriptArea.scrollTop = transcriptArea.scrollHeight;

      return body;
    }

    function startCurrentAiMessage() {
      if (emptyState) emptyState.remove();
      currentAiText = '';

      const msg = document.createElement('div');
      msg.className = 'message ai';

      const label = document.createElement('div');
      label.className = 'message-label';
      label.textContent = 'Jarvis';

      const body = document.createElement('div');
      body.className = 'message-text';

      msg.appendChild(label);
      msg.appendChild(body);
      transcriptArea.appendChild(msg);
      transcriptArea.scrollTop = transcriptArea.scrollHeight;

      currentAiMessageEl = body;
    }

    function appendAiDelta(delta) {
      if (!currentAiMessageEl) startCurrentAiMessage();
      currentAiText += delta;
      currentAiMessageEl.textContent = currentAiText;
      transcriptArea.scrollTop = transcriptArea.scrollHeight;
    }

    function finalizeAiMessage(transcript) {
      if (currentAiMessageEl) {
        currentAiMessageEl.textContent = transcript || currentAiText;
      }
      currentAiMessageEl = null;
      currentAiText = '';
      transcriptArea.scrollTop = transcriptArea.scrollHeight;
    }

    function setupVisualizer(stream) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const size = orbWrapper.offsetWidth;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      let phase = 0;

      function draw() {
        animFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const baseRadius = w * 0.32;
        canvasCtx.clearRect(0, 0, w, h);

        /* -- Average energy -- */
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength / 255;

        /* -- Radial waveform ring -- */
        const points = 80;
        phase += 0.008;

        for (let layer = 2; layer >= 0; layer--) {
          const layerScale = 1 + layer * 0.08;
          const layerAlpha = (0.25 - layer * 0.07);

          canvasCtx.beginPath();
          for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const dataIndex = Math.floor((i / points) * bufferLength);
            const value = dataArray[dataIndex] / 255;

            const displacement = value * baseRadius * 0.35;
            const noise = Math.sin(angle * 3 + phase + layer) * avg * baseRadius * 0.08;
            const r = (baseRadius + displacement + noise) * layerScale;

            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
          }
          canvasCtx.closePath();
          canvasCtx.strokeStyle = 'rgba(212, 165, 74, ' + layerAlpha + ')';
          canvasCtx.lineWidth = 1.5 - layer * 0.3;
          canvasCtx.stroke();
        }

        /* -- Center glow -- */
        const glowR = baseRadius * (0.25 + avg * 0.3);
        const glow = canvasCtx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glow.addColorStop(0, 'rgba(212, 165, 74, ' + (0.12 + avg * 0.15) + ')');
        glow.addColorStop(1, 'rgba(212, 165, 74, 0)');
        canvasCtx.fillStyle = glow;
        canvasCtx.beginPath();
        canvasCtx.arc(cx, cy, glowR, 0, Math.PI * 2);
        canvasCtx.fill();
      }

      draw();
    }

    function cleanupVisualizer() {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (audioCtx) {
        audioCtx.close().catch(function() {});
        audioCtx = null;
      }
      analyser = null;
      /* clear canvas */
      const w = canvas.width;
      const h = canvas.height;
      canvasCtx.clearRect(0, 0, w, h);
    }

    function showToolIndicator(name) {
      if (emptyState) emptyState.remove();
      var el = document.createElement('div');
      el.className = 'tool-indicator';
      el.id = 'toolIndicator';
      var label = name === 'exa_search' ? 'Searching the web\u2026' : 'Running ' + name + '\u2026';
      el.innerHTML = '<div class="tool-spinner"></div><span>' + label + '</span>';
      transcriptArea.appendChild(el);
      transcriptArea.scrollTop = transcriptArea.scrollHeight;
    }

    function hideToolIndicator() {
      var el = document.getElementById('toolIndicator');
      if (el) el.remove();
    }

    async function handleFunctionCall(event) {
      var callId = event.call_id;
      var name = event.name;
      var args;
      try { args = JSON.parse(event.arguments); } catch (e) { args = {}; }

      showToolIndicator(name);

      try {
        var res = await fetch('/tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, arguments: args })
        });
        var data = await res.json();
        var output = data.error ? JSON.stringify({ error: data.error }) : JSON.stringify(data.result);
      } catch (err) {
        var output = JSON.stringify({ error: 'Network error: ' + err.message });
      }

      hideToolIndicator();

      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: output
          }
        }));
        dc.send(JSON.stringify({ type: 'response.create' }));
      }
    }

    async function connect() {
      setState('connecting');

      try {
        const sessionRes = await fetch('/session', { method: 'POST' });
        if (!sessionRes.ok) throw new Error('Failed to create session: ' + sessionRes.status);
        const sessionData = await sessionRes.json();
        const ephemeralKey = sessionData.client_secret.value;

        pc = new RTCPeerConnection();

        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        pc.ontrack = function(event) {
          audioEl.srcObject = event.streams[0];
        };

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStream.getTracks().forEach(function(track) {
          pc.addTrack(track, localStream);
        });

        dc = pc.createDataChannel('oai-events');
        dc.onmessage = function(event) {
          try {
            const msg = JSON.parse(event.data);
            handleDataChannelEvent(msg);
          } catch (e) {
            // ignore non-JSON messages
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpRes = await fetch(
          'https://api.openai.com/v1/realtime?model=' + encodeURIComponent(MODEL),
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + ephemeralKey,
              'Content-Type': 'application/sdp'
            },
            body: offer.sdp
          }
        );

        if (!sdpRes.ok) throw new Error('Failed to get SDP answer: ' + sdpRes.status);
        const answerSdp = await sdpRes.text();

        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        setupVisualizer(localStream);
        setState('connected');
      } catch (err) {
        console.error('Connection failed:', err);
        disconnect();
        alert('Failed to connect: ' + err.message);
      }
    }

    function handleDataChannelEvent(event) {
      switch (event.type) {
        case 'session.created':
        case 'session.updated':
          setState('connected');
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (event.transcript && event.transcript.trim()) {
            addMessage('user', event.transcript.trim());
          }
          break;

        case 'response.audio_transcript.delta':
          appendAiDelta(event.delta || '');
          break;

        case 'response.audio_transcript.done':
          finalizeAiMessage(event.transcript);
          break;

        case 'input_audio_buffer.speech_started':
          listeningPill.classList.add('visible');
          break;

        case 'input_audio_buffer.speech_stopped':
          listeningPill.classList.remove('visible');
          break;

        case 'response.function_call_arguments.done':
          handleFunctionCall(event);
          break;

        case 'response.audio.done':
          break;
      }
    }

    function disconnect() {
      if (dc) {
        dc.close();
        dc = null;
      }
      if (pc) {
        pc.close();
        pc = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(function(track) { track.stop(); });
        localStream = null;
      }
      cleanupVisualizer();
      currentAiMessageEl = null;
      currentAiText = '';
      setState('disconnected');
    }

    function toggleConnection() {
      if (state === 'connected') {
        disconnect();
      } else if (state === 'disconnected') {
        connect();
      }
    }
  </script>
</body>
</html>`;
