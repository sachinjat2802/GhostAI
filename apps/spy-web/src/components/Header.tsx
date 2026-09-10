import React from 'react';

interface HeaderProps {
  mode: string;
  isDisguiseTheme: boolean;
  onToggleDisguise: () => void;
  onAdjustFontSize: (delta: number) => void;
  onToggleSettings: () => void;
  isConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  isDisguiseTheme,
  onToggleDisguise,
  onAdjustFontSize,
  onToggleSettings,
  isConnected,
}) => {
  return (
    <header className="header">
      <div className="header-left">
        <span className="app-icon">👻</span>
        <div className="header-titles">
          <span className="app-name">
            {isDisguiseTheme ? 'Meeting Notes' : 'Ghost AI Remote'}
          </span>
          <span className="mode-badge">{mode}</span>
        </div>
      </div>
      <div className="header-actions">
        <button
          onClick={onToggleDisguise}
          title="Stealth Notes Disguise Theme"
          className="icon-btn"
        >
          📝
        </button>
        <button
          onClick={() => onAdjustFontSize(1)}
          title="Increase text size"
          className="text-btn"
        >
          A+
        </button>
        <button
          onClick={() => onAdjustFontSize(-1)}
          title="Decrease text size"
          className="text-btn"
        >
          A-
        </button>
        <button onClick={onToggleSettings} title="Settings" className="icon-btn">
          ⚙️
        </button>
        <div
          className={`status-indicator ${isConnected ? 'connected' : ''}`}
          title={isConnected ? 'Connected to Core Engine' : 'Reconnecting...'}
        />
      </div>
    </header>
  );
};
