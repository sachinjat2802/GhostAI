import React from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

interface SuggestionPanelProps {
  messages: ChatMessage[];
  streamingText: string;
  fontSize: number;
  mode: string;
}

function formatMarkdown(text: string) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[•\-] (.+)/gm, '<div style="padding-left:10px;">• $1</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

export const SuggestionPanel: React.FC<SuggestionPanelProps> = React.memo(({
  messages,
  streamingText,
  fontSize,
  mode,
}) => {
  const panelLabel =
    mode === 'general' || mode === 'coding' ? '💬 CHAT HISTORY' : '🧠 AI ANSWER';

  return (
    <div className="panel" style={{ flex: 1, contain: 'content' }}>
      <div className="panel-label">{panelLabel}</div>
      <div className="panel-content">
        {messages.length === 0 && !streamingText && (
          <div style={{ opacity: 0.5, fontStyle: 'italic', fontSize: '13px' }}>
            Waiting for input or speech context...
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-msg ${msg.role === 'ai' ? 'ai-msg' : 'user-msg'}`}
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }}
          />
        ))}

        {streamingText && (
          <div
            className="chat-msg ai-msg"
            style={{ fontSize: `${fontSize}px` }}
          >
            <span
              dangerouslySetInnerHTML={{ __html: formatMarkdown(streamingText) }}
            />
            <span className="streaming-cursor"> ▌</span>
          </div>
        )}
      </div>
    </div>
  );
});
