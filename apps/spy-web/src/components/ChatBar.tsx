import React, { useState } from 'react';

interface ChatBarProps {
  onSendChat: (text: string) => void;
}

export const ChatBar: React.FC<ChatBarProps> = ({ onSendChat }) => {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim()) return;
    onSendChat(text.trim());
    setText('');
  };

  return (
    <div className="chat-bar">
      <input
        type="text"
        className="chat-input"
        placeholder="Quick follow-up question..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSend();
        }}
      />
      <button onClick={handleSend} className="chat-send-btn">
        ⏎
      </button>
    </div>
  );
};
