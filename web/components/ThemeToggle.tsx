'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    // Check if user has a preference stored
    const stored = localStorage.getItem('theme')
    if (stored === 'light') {
      setIsDark(false)
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)

    if (newIsDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  return (
    <wa-button
      onClick={toggleTheme}
      className="fixed top-4 right-4"
      appearance="outlined"
      aria-label="Toggle theme"
    >
      <wa-icon
        name={isDark ? 'sun' : 'moon'}
        library="fa"
        style={{ fontSize: '1.25rem', color: isDark ? '#fbbf24' : undefined }}
      ></wa-icon>
    </wa-button>
  )
}
