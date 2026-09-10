import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSettings: (settings: {
    geminiModel: string;
    apiKey: string;
    resume: string;
    jobDescription: string;
    vadThreshold: number;
  }) => void;
  onExportSession: (format: 'md' | 'json') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaveSettings,
  onExportSession,
}) => {
  const [geminiModel, setGeminiModel] = useState('gemini-3.5-flash-lite');
  const [apiKey, setApiKey] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [resume, setResume] = useState('');
  const [vadThreshold, setVadThreshold] = useState(0.015);

  useEffect(() => {
    if (isOpen) {
      setGeminiModel(localStorage.getItem('gemini_model') || 'gemini-3.5-flash-lite');
      setApiKey(localStorage.getItem('gemini_api_key') || '');
      setJobDescription(localStorage.getItem('job_description') || '');
      setResume(localStorage.getItem('candidate_resume') || '');
      setVadThreshold(parseFloat(localStorage.getItem('vad_sensitivity') || '0.015'));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('gemini_model', geminiModel);
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('job_description', jobDescription);
    localStorage.setItem('candidate_resume', resume);
    localStorage.setItem('vad_sensitivity', vadThreshold.toString());

    onSaveSettings({
      geminiModel,
      apiKey,
      resume,
      jobDescription,
      vadThreshold,
    });
    onClose();
  };

  return (
    <div className={`settings-overlay ${isOpen ? 'active' : ''}`}>
      <div className="settings-header">
        <span>⚙️ Settings & Configuration</span>
        <button onClick={onClose} className="close-btn">
          ×
        </button>
      </div>

      <div className="settings-body">
        <div className="setting-group">
          <label htmlFor="setting-gemini-model">Google Gemini Model</label>
          <select
            id="setting-gemini-model"
            className="input-select"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
          >
            <option value="gemini-3.5-flash-lite">
              ✨ Gemini 3.5 Flash Lite (Recommended - Fast)
            </option>
            <option value="gemini-3.5-flash">
              ⚡ Gemini 3.5 Flash (Standard)
            </option>
            <option value="gemini-3.5">
              🚀 Gemini 3.5 (Pro High Quality)
            </option>
            <option value="gemini-2.5-flash">
              ⚡ Gemini 2.5 Flash
            </option>
            <option value="gemini-1.5-flash">
              ⚡ Gemini 1.5 Flash
            </option>
          </select>
        </div>

        <div className="setting-group">
          <label htmlFor="setting-gemini-key">Gemini API Key</label>
          <input
            type="password"
            id="setting-gemini-key"
            className="input-text"
            placeholder="Enter Gemini API Key..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="setting-job-desc">Target Job Description / Context</label>
          <textarea
            id="setting-job-desc"
            className="input-textarea"
            placeholder="Paste job description or target requirements..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="setting-resume">
            Candidate Resume / Knowledge Base
          </label>
          <textarea
            id="setting-resume"
            className="input-textarea large"
            placeholder="Paste your resume or context background..."
            value={resume}
            onChange={(e) => setResume(e.target.value)}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="setting-vad-sensitivity">
            VAD Sensitivity (Mic Gate):{' '}
            <span className="highlight-val">{vadThreshold.toFixed(3)}</span>
          </label>
          <input
            type="range"
            id="setting-vad-sensitivity"
            min="0.005"
            max="0.05"
            step="0.005"
            className="input-range"
            value={vadThreshold}
            onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
          />
        </div>

        <div className="export-row">
          <button
            onClick={() => onExportSession('md')}
            className="btn-secondary"
          >
            📥 Export MD
          </button>
          <button
            onClick={() => onExportSession('json')}
            className="btn-secondary"
          >
            📥 Export JSON
          </button>
        </div>

        <button onClick={handleSave} className="btn-primary-block">
          Save & Apply Settings
        </button>
      </div>
    </div>
  );
};
