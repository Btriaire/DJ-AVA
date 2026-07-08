import { useState } from 'react'
import '../styles/Reader.css'

export default function Reader({ book, onHighlight, highlights }) {
  const [fontSize, setFontSize] = useState(16)
  const [isDark, setIsDark] = useState(false)

  const iframeStyle = {
    fontSize: `${fontSize}px`,
    backgroundColor: isDark ? '#1a1a1a' : '#fff',
    color: isDark ? '#e0e0e0' : '#000'
  }

  return (
    <div className="reader">
      <div className="reader-controls">
        <div className="controls-left">
          <label>
            Size:
            <input
              type="range"
              min="12"
              max="24"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
            />
          </label>
        </div>
        <div className="controls-center">
          <h2>{book.title}</h2>
          <p>{book.author}</p>
        </div>
        <div className="controls-right">
          <button onClick={() => setIsDark(!isDark)} className="dark-mode-btn">
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      <iframe
        id="viewer"
        src={book.url}
        className={`book-viewer ${isDark ? 'dark' : ''}`}
        sandbox="allow-scripts allow-same-origin"
        style={iframeStyle}
      />

      {highlights.length > 0 && (
        <div className="highlights-panel">
          <h3>✏️ Highlights ({highlights.length})</h3>
          <div className="highlights-list">
            {highlights.map((h, i) => (
              <div key={i} className="highlight-item">
                <p>{h.text}</p>
                <small>{new Date(h.date).toLocaleDateString()}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
