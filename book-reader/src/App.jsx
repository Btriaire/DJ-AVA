import { useState, useEffect } from 'react'
import './App.css'
import Library from './components/Library'
import Reader from './components/Reader'

export default function App() {
  const [books, setBooks] = useState([])
  const [selectedBook, setSelectedBook] = useState(null)
  const [highlights, setHighlights] = useState({})

  useEffect(() => {
    const saved = localStorage.getItem('highlights')
    if (saved) setHighlights(JSON.parse(saved))
  }, [])

  const addHighlight = (bookId, text, cfiRange) => {
    setHighlights(prev => {
      const bookHighlights = prev[bookId] || []
      const updated = {
        ...prev,
        [bookId]: [...bookHighlights, { text, cfiRange, date: new Date().toISOString() }]
      }
      localStorage.setItem('highlights', JSON.stringify(updated))
      return updated
    })
  }

  return (
    <div className="app">
      <Library
        books={books}
        setBooks={setBooks}
        selectedBook={selectedBook}
        setSelectedBook={setSelectedBook}
        highlights={highlights[selectedBook?.id] || []}
      />
      {selectedBook && (
        <Reader
          book={selectedBook}
          onHighlight={addHighlight}
          highlights={highlights[selectedBook.id] || []}
        />
      )}
    </div>
  )
}
