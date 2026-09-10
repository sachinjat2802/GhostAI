import React from 'react';

interface TranscriptPanelProps {
  transcript: string;
  isListening: boolean;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  transcript,
  isListening,
}) => {
  return (
    <div className="panel">
      <div className="panel-label">
        <span>🎙️ LIVE TRANSCRIPT</span>
        {isListening && (
          <span style={{ fontSize: '9px', color: '#10b981', marginLeft: 'auto' }}>
            ● REC
          </span>
        )}
      </div>
      <div className="panel-content">
        {transcript || (isListening ? 'Listening for speech...' : 'Press Start to listen...')}
      </div>
    </div>
  );
};
