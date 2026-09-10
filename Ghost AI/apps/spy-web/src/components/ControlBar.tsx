import React from 'react';

interface ControlBarProps {
  mode: string;
  isListening: boolean;
  onToggleListening: () => void;
  onTriggerSolve: () => void;
  onSendCommand: (type: string, payload?: any) => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  mode,
  isListening,
  onToggleListening,
  onTriggerSolve,
  onSendCommand,
}) => {
  const showSolve = mode === 'coding' || mode === 'interview';
  const showListen = mode !== 'general';

  return (
    <div className="controls-grid">
      {showListen ? (
        <button
          className="control-btn btn-accent"
          style={{ background: isListening ? '#ef4444' : '#8b5cf6' }}
          onClick={onToggleListening}
        >
          {isListening ? 'Stop' : 'Start'}
        </button>
      ) : (
        <div />
      )}

      {showSolve ? (
        <button className="control-btn btn-cyan" onClick={onTriggerSolve}>
          📸 Solve
        </button>
      ) : (
        <div />
      )}

      <button
        className="control-btn btn-muted"
        onClick={() => onSendCommand('toggle-visibility')}
      >
        🕵️ Hide PC
      </button>

      <button
        className="control-btn btn-clear"
        onClick={() => onSendCommand('clear-context')}
      >
        Clear
      </button>

      <select
        className="mode-selector"
        value={mode}
        onChange={(e) => onSendCommand('set-mode', e.target.value)}
      >
        <option value="interview">💼 Interview</option>
        <option value="meeting">🤝 Meeting</option>
        <option value="coding">💻 Coding</option>
        <option value="general">🌐 General</option>
      </select>
    </div>
  );
};
