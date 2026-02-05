import { useEffect, useCallback } from 'react'

export interface ShortcutHandlers {
  onNewTask?: () => void
  onNewWorkspace?: () => void
  onShortcutsHelp?: () => void
  onSearch?: () => void
  onPrevWorkspace?: () => void
  onNextWorkspace?: () => void
  onAllProjects?: () => void
  onPrevProject?: () => void
  onNextProject?: () => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        if (e.key === 'Escape') return
        return
      }
      const key = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey
      if (mod && key === 'k') {
        e.preventDefault()
        handlers.onSearch?.()
        return
      }
      if (e.key === 'n' && !mod) {
        e.preventDefault()
        handlers.onNewTask?.()
        return
      }
      if (e.key === 'w' && !mod) {
        e.preventDefault()
        handlers.onNewWorkspace?.()
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        handlers.onShortcutsHelp?.()
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        handlers.onSearch?.()
        return
      }
      const shift = e.shiftKey
      if (mod && shift && key === 'arrowleft') {
        e.preventDefault()
        handlers.onPrevWorkspace?.()
        return
      }
      if (mod && shift && key === 'arrowright') {
        e.preventDefault()
        handlers.onNextWorkspace?.()
        return
      }
      if (mod && shift && key === 'a') {
        e.preventDefault()
        handlers.onAllProjects?.()
        return
      }
      if (mod && shift && key === 'arrowup') {
        e.preventDefault()
        handlers.onPrevProject?.()
        return
      }
      if (mod && shift && key === 'arrowdown') {
        e.preventDefault()
        handlers.onNextProject?.()
        return
      }
    },
    [handlers]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
