      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {completingTaskId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center theme-overlay backdrop-blur-sm p-4"
          onClick={() => setCompletingTaskId(null)}
          role="dialog"
          aria-label="Add completion note"
        >
          <div
            className="glass-strong w-full max-w-md rounded-2xl p-6 shadow-xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold theme-text">Mark task done</h3>
            <p className="mt-1 text-sm theme-text-muted">Add an optional note (e.g. what was shipped).</p>
            <textarea
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="Completion note (optional)"
              rows={3}
              className="mt-4 w-full rounded-2xl theme-input px-4 py-3"
              autoFocus
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setCompletingTaskId(null)}
                className="rounded-2xl border theme-border px-4 py-2 text-sm theme-text-muted theme-surface-hover-bg hover:theme-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDoneWithNote}
                disabled={updatingTaskId === completingTaskId}
                className="rounded-2xl theme-surface-bg theme-border border px-4 py-2 text-sm font-medium theme-text hover:opacity-90 disabled:opacity-50"
              >
                {updatingTaskId === completingTaskId ? 'Completing…' : 'Mark done'}
              </button>
            </div>
          </div>
        </div>
      )}
      {commandBarOpen && user && (
        <CommandBar
          currentWorkspace={currentWorkspace}
          userId={user.uid}
          onClose={() => setCommandBarOpen(false)}
          onNavigate={navigate}
        />
      )}

      {calendarOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center theme-overlay backdrop-blur-sm p-4"
          onClick={() => setCalendarOpen(false)}
          role="dialog"
          aria-label="Task calendar"
        >
          <div
            className="glass-strong w-full max-w-3xl rounded-2xl p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest theme-text-muted">Schedule</p>
                <p className="text-lg font-semibold theme-text">
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  className="rounded-xl px-3 py-1.5 text-sm theme-text-muted hover:theme-text theme-surface-hover-bg"
                  aria-label="Close calendar"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 lg:flex-row">
              <div className="lg:w-2/3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((m) => addMonths(m, -1))}
                      className="rounded-lg px-2 py-1 text-sm theme-text-muted hover:theme-text theme-surface-hover-bg"
                      aria-label="Previous month"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date()
                        setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                        setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
                      }}
                      className="rounded-lg px-2 py-1 text-xs font-medium theme-text-muted hover:theme-text theme-surface-hover-bg"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                      className="rounded-lg px-2 py-1 text-sm theme-text-muted hover:theme-text theme-surface-hover-bg"
                      aria-label="Next month"
                    >
                      ›
                    </button>
                  </div>
                  <p className="text-sm theme-text-muted">
                    Showing tasks for {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-7 text-[11px] uppercase tracking-wide text-center theme-text-muted">
                  {weekdayLabels.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
                  {calendarDays.map((day) => {
                    const isCurrentMonth = day.getMonth() === calendarMonth.getMonth()
                    const isSelected = isSameDay(day, selectedDate)
                    const key = formatDateKey(day)
                    const hasTasks = tasksByDate.has(key)
                    return (
                      <button
                        key={`${key}-${day.getMonth()}`}
                        type="button"
                        onClick={() => {
                          setSelectedDate(new Date(day))
                          setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1))
                        }}
                        className={`relative aspect-square w-full rounded-xl text-center transition-colors duration-150 ${isSelected
                          ? 'bg-[var(--color-accent)] text-black font-semibold shadow-sm'
                          : 'theme-surface-bg theme-border border hover:theme-surface-hover-bg'
                          } ${!isCurrentMonth ? 'opacity-60' : ''}`}
                      >
                        {day.getDate()}
                        {hasTasks && (
                          <span className="absolute bottom-1 left-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="lg:w-1/3 rounded-2xl border theme-border bg-black/5 dark:bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-widest theme-text-muted">Selected</p>
                    <p className="text-sm font-medium theme-text">
                      {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {currentWorkspace && (
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarOpen(false)
                        navigate(`/workspaces/${currentWorkspace.id}/tasks/new?due=${selectedDateKey}`)
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium theme-surface-bg theme-border border theme-text transition-colors theme-surface-hover-bg"
                    >
                      Schedule task
                    </button>
                  )}
                </div>
                {tasksOnSelectedDate.length === 0 && (
                  <p className="text-sm theme-text-muted">No tasks scheduled.</p>
                )}
                {tasksOnSelectedDate.length > 0 && (
                  <ul className="space-y-2 max-h-64 overflow-auto pr-1">
                    {tasksOnSelectedDate.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 theme-surface-hover-bg">
                        <button
                          type="button"
                          onClick={() => {
                            setCalendarOpen(false)
                            navigate(`/tasks/${t.id}`)
                          }}
                          className="text-sm theme-text text-left truncate hover:underline"
                        >
                          {t.title}
                        </button>
                        <span className="text-[11px] uppercase tracking-wide theme-text-muted">{t.priority}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
