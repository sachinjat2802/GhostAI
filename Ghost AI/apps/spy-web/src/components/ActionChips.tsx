import React from 'react';

interface ActionChipsProps {
  onTriggerAiAction: (action: string) => void;
}

export const ActionChips: React.FC<ActionChipsProps> = ({
  onTriggerAiAction,
}) => {
  return (
    <div className="action-chips">
      <button
        onClick={() => onTriggerAiAction('shorter')}
        className="chip chip-purple"
      >
        ⚡ Shorter
      </button>
      <button
        onClick={() => onTriggerAiAction('bullet-points')}
        className="chip chip-cyan"
      >
        🎯 Bullets
      </button>
      <button
        onClick={() => onTriggerAiAction('deeper-code')}
        className="chip chip-emerald"
      >
        💻 Code & Complexity
      </button>
      <button
        onClick={() => onTriggerAiAction('regenerate')}
        className="chip chip-amber"
      >
        🔄 Regenerate
      </button>
    </div>
  );
};
