export const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="rt-model" content="gpt-4o-realtime-preview">
  <title>Jarvis Voice</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0a0a0f;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 24px 16px;
    }

    #app {
      width: 100%;
      max-width: 600px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    .header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #94a3b8;
      background: #12121a;
      padding: 6px 14px;
      border-radius: 20px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #94a3b8;
      transition: background 0.3s ease;
    }

    .status-dot.connected {
      background: #22c55e;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
    }

    .status-dot.connecting {
      background: #eab308;
      animation: pulse-dot 1.2s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .connect-btn {
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #6366f1;
      transition: background 0.2s ease, opacity 0.2s ease, transform 0.1s ease;
      margin-bottom: 20px;
    }

    .connect-btn:hover:not(:disabled) {
      background: #4f46e5;
      transform: translateY(-1px);
    }

    .connect-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .connect-btn:disabled {
      cursor: not-allowed;
    }

    .connect-btn.connecting {
      background: #6366f1;
      animation: pulse-btn 1.5s ease-in-out infinite;
    }

    .connect-btn.connected {
      background: #ef4444;
    }

    .connect-btn.connected:hover {
      background: #dc2626;
    }

    @keyframes pulse-btn {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .visualizer-container {
      display: none;
      margin-bottom: 20px;
      background: #12121a;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    }

    .visualizer-container.visible {
      display: block;
    }

    #visualizer {
      width: 100%;
      height: 80px;
      display: block;
    }

    .listening-indicator {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px;
      color: #22c55e;
      font-size: 13px;
      font-weight: 500;
    }

    .listening-indicator.visible {
      display: flex;
    }

    .listening-indicator .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
      animation: listening-bounce 1s ease-in-out infinite;
    }

    .listening-indicator .dot:nth-child(2) { animation-delay: 0.15s; }
    .listening-indicator .dot:nth-child(3) { animation-delay: 0.3s; }

    @keyframes listening-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    .transcript-area {
      background: #12121a;
      border-radius: 12px;
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
      scroll-behavior: smooth;
    }

    .transcript-area::-webkit-scrollbar {
      width: 6px;
    }

    .transcript-area::-webkit-scrollbar-track {
      background: transparent;
    }

    .transcript-area::-webkit-scrollbar-thumb {
      background: #2a2a3e;
      border-radius: 3px;
    }

    .transcript-empty {
      text-align: center;
      color: #94a3b8;
      font-size: 14px;
      padding: 40px 0;
    }

    .message {
      margin-bottom: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      animation: fade-in 0.2s ease;
    }

    .message:last-child {
      margin-bottom: 0;
    }

    .message.user {
      background: #1e1b4b;
    }

    .message.ai {
      background: #1a1a2e;
    }

    .message-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
      margin-bottom: 4px;
    }

    .message-text {
      font-size: 15px;
      line-height: 1.5;
      color: #e2e8f0;
      word-wrap: break-word;
    }

    .tool-indicator {
      margin-bottom: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      background: #1a1a2e;
      border-left: 3px solid #6366f1;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: fade-in 0.2s ease;
      color: #a5b4fc;
      font-size: 14px;
    }

    .tool-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #4338ca;
      border-top-color: #a5b4fc;
      border-radius: 50%;
      animation: tool-spin 0.8s linear infinite;
    }

    @keyframes tool-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="header">
      <h1>Jarvis Voice</h1>
      <div class="status-badge">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Disconnected</span>
      </div>
    </div>

    <button class="connect-btn" id="connectBtn" onclick="toggleConnection()">
      Start Conversation
    </button>

    <div class="visualizer-container" id="visualizerContainer">
      <canvas id="visualizer"></canvas>
      <div class="listening-indicator" id="listeningIndicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <span>Listening...</span>
      </div>
    </div>

    <div class="transcript-area" id="transcriptArea">
      <div class="transcript-empty" id="emptyState">
        Start a conversation to see the transcript here.
      </div>
    </div>
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
    let state = 'disconnected'; // disconnected | connecting | connected

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const connectBtn = document.getElementById('connectBtn');
    const visualizerContainer = document.getElementById('visualizerContainer');
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const listeningIndicator = document.getElementById('listeningIndicator');
    const transcriptArea = document.getElementById('transcriptArea');
    const emptyState = document.getElementById('emptyState');

    function setState(newState) {
      state = newState;
      statusDot.className = 'status-dot' + (newState !== 'disconnected' ? ' ' + newState : '');

      if (newState === 'disconnected') {
        statusText.textContent = 'Disconnected';
        connectBtn.textContent = 'Start Conversation';
        connectBtn.className = 'connect-btn';
        connectBtn.disabled = false;
        visualizerContainer.classList.remove('visible');
        listeningIndicator.classList.remove('visible');
      } else if (newState === 'connecting') {
        statusText.textContent = 'Connecting...';
        connectBtn.textContent = 'Connecting...';
        connectBtn.className = 'connect-btn connecting';
        connectBtn.disabled = true;
      } else if (newState === 'connected') {
        statusText.textContent = 'Connected';
        connectBtn.textContent = 'End Conversation';
        connectBtn.className = 'connect-btn connected';
        connectBtn.disabled = false;
        visualizerContainer.classList.add('visible');
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
      transcriptArea.appendChild(msg);
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
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function resizeCanvas() {
        canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
        canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      }

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      function draw() {
        animFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const w = canvas.width;
        const h = canvas.height;
        canvasCtx.clearRect(0, 0, w, h);

        const barCount = 64;
        const barWidth = (w / barCount) * 0.7;
        const gap = (w / barCount) * 0.3;

        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.floor(i * bufferLength / barCount);
          const value = dataArray[dataIndex] / 255;
          const barHeight = Math.max(2, value * h * 0.85);

          const x = i * (barWidth + gap) + gap / 2;
          const y = (h - barHeight) / 2;

          canvasCtx.fillStyle = 'rgba(99, 102, 241, ' + (0.3 + value * 0.7) + ')';
          canvasCtx.beginPath();
          canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
          canvasCtx.fill();
        }
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
    }

    function showToolIndicator(name) {
      if (emptyState) emptyState.remove();
      var el = document.createElement('div');
      el.className = 'tool-indicator';
      el.id = 'toolIndicator';
      var label = name === 'exa_search' ? 'Searching the web...' : 'Running ' + name + '...';
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
          listeningIndicator.classList.add('visible');
          break;

        case 'input_audio_buffer.speech_stopped':
          listeningIndicator.classList.remove('visible');
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
