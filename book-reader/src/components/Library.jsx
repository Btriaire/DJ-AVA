import { useState } from 'react'
import axios from 'axios'
import '../styles/Library.css'

export default function Library({ books, setBooks, selectedBook, setSelectedBook, highlights }) {
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState('gutenberg')

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!search.trim()) return

    setLoading(true)
    let results = []

    if (source === 'gutenberg') {
      results = await searchGutenberg(search)
    } else {
      results = await searchOpenLibrary(search)
    }

    setBooks(results)
    setLoading(false)
  }

  const searchGutenberg = async (query) => {
    try {
      const res = await axios.get('https://gutendex.com/books', {
        params: { search: query }
      })
      return res.data.results.map(book => {
        const htmlUrl = book.formats['text/html']
        const finalUrl = htmlUrl ? htmlUrl.replace('cache', 'files').replace(/\.txt/, '-h.htm') :
                         `https://www.gutenberg.org/files/${book.id}/${book.id}-h/${book.id}-h.htm`

        return {
          id: `gutenberg-${book.id}`,
          title: book.title,
          author: book.authors[0]?.name || 'Unknown',
          cover: book.cover_image,
          source: 'gutenberg',
          url: finalUrl,
          type: 'html'
        }
      })
    } catch (e) {
      console.error('Gutenberg error:', e)
      return []
    }
  }

  const searchOpenLibrary = async (query) => {
    try {
      const res = await axios.get('https://openlibrary.org/search.json', {
        params: {
          title: query,
          limit: 10
        }
      })
      return res.data.docs?.map(book => ({
        id: `openlibrary-${book.key}`,
        title: book.title,
        author: book.author_name?.[0] || 'Unknown',
        cover: book.cover_id ? `https://covers.openlibrary.org/b/id/${book.cover_id}-M.jpg` : null,
        source: 'openlibrary',
        url: `https://openlibrary.org${book.key}`,
        type: 'preview'
      })) || []
    } catch (e) {
      console.error('Open Library error:', e)
      return []
    }
  }

  return (
    <div className="library">
      <h1>📚 Reader</h1>

      <form onSubmit={handleSearch} className="search-form">
        <div className="source-selector">
          <label>
            <input
              type="radio"
              value="gutenberg"
              checked={source === 'gutenberg'}
              onChange={(e) => setSource(e.target.value)}
            />
            Gutenberg
          </label>
          <label>
            <input
              type="radio"
              value="openlibrary"
              checked={source === 'openlibrary'}
              onChange={(e) => setSource(e.target.value)}
            />
            Open Library
          </label>
        </div>
        <input
          type="text"
          placeholder="Search books..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="books-list">
        {books.length === 0 && <p className="empty">Search to find books</p>}
        {books.map(book => (
          <div
            key={book.id}
            className={`book-item ${selectedBook?.id === book.id ? 'active' : ''}`}
            onClick={() => setSelectedBook(book)}
          >
            {book.cover && <img src={book.cover} alt={book.title} />}
            <div className="book-info">
              <h3>{book.title}</h3>
              <p>{book.author}</p>
              {highlights.length > 0 && <span className="highlight-badge">{highlights.length} 🎨</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
