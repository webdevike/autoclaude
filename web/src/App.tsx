import { useWebSocket } from './hooks/useWebSocket';
import { PushToTalk } from './components/PushToTalk';
import { ProgressDisplay } from './components/ProgressDisplay';
import { TextInput } from './components/TextInput';
import './App.css';

export function App() {
  const {
    isConnected,
    isProcessing,
    messages,
    sendMessage,
    sendAudio,
    commitAudio,
    clearMessages,
  } = useWebSocket();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voice Dev Assistant</h1>
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main className="app-main">
        <ProgressDisplay messages={messages} onClear={clearMessages} />
      </main>

      <footer className="app-footer">
        <PushToTalk
          onAudioChunk={sendAudio}
          onCommit={commitAudio}
          disabled={isProcessing}
        />
        <TextInput onSend={sendMessage} disabled={isProcessing} />
      </footer>
    </div>
  );
}
