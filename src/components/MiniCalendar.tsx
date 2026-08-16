import { useState } from 'react'

import { useAuth } from '../contexts/AuthContext'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface MiniCalendarProps {
    onSelectDate: (date: Date) => void
    className?: string
}

export function MiniCalendar({ onSelectDate, className = '' }: MiniCalendarProps) {
    const [viewDate, setViewDate] = useState(new Date())
    const { profile } = useAuth()
    // 0 = Sunday. The grid was hardcoded to Sunday-first, which is wrong for
    // most of the world; the preference existed in the data model with nothing
    // reading it.
    const weekStartsOn = profile?.preferences?.weekStartsOn ?? 0

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate()
    }

    // Offset of the 1st within a week that begins on `weekStartsOn`.
    const getFirstDayOfMonth = (year: number, month: number) => {
        return (new Date(year, month, 1).getDay() - weekStartsOn + 7) % 7
    }

    const prevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
    }

    const nextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
    }

    const handleDayClick = (day: number) => {
        const selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
        onSelectDate(selectedDate)
    }

    const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth())
    const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth())
    const today = new Date()
    const isCurrentMonth = today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear()

    // Generate grid
    const blanks = Array.from({ length: firstDay }, (_, i) => i)
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

    return (
        <div className={`w-[260px] select-none ${className}`}>
            <div className="flex items-center justify-between mb-3 theme-text">
                <button
                    onClick={(e) => { e.stopPropagation(); prevMonth() }}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="text-sm font-semibold tracking-wide">
                    {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); nextMonth() }}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {WEEKDAYS.map((d, i) => [d, i]).slice(weekStartsOn).concat(WEEKDAYS.map((d, i) => [d, i]).slice(0, weekStartsOn)).map(([d, i]) => (
                    <span key={i as number} className="text-[10px] uppercase font-bold theme-text-muted opacity-60">
                        {d}
                    </span>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
                {blanks.map(i => <div key={`blank-${i}`} />)}
                {days.map(day => {
                    const isToday = isCurrentMonth && day === today.getDate()
                    return (
                        <button
                            key={day}
                            onClick={(e) => { e.stopPropagation(); handleDayClick(day) }}
                            className={`
                h-7 w-7 rounded-full text-xs font-medium flex items-center justify-center transition-all
                hover:scale-110 active:scale-95
                ${isToday
                                    ? 'bg-[var(--color-primary)] text-white shadow-md shadow-orange-500/30'
                                    : 'theme-text hover:bg-black/5 dark:hover:bg-white/5'
                                }
              `}
                            title={`Schedule for ${viewDate.toLocaleString('default', { month: 'long' })} ${day}`}
                        >
                            {day}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
