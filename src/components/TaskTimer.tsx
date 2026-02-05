import { useEffect, useState } from 'react'

interface TaskTimerProps {
    startedAt?: { toMillis: () => number } | null
    elapsed?: number
    timerLastStartedAt?: { toMillis: () => number } | null
    isRunning?: boolean
    className?: string
}

export function TaskTimer({ startedAt, elapsed = 0, timerLastStartedAt, isRunning, className = '' }: TaskTimerProps) {
    const [displayTime, setDisplayTime] = useState(elapsed)

    useEffect(() => {
        // If we have explicit timer state (timerLastStartedAt exists), use that.
        // Otherwise fall back to legacy 'startedAt' behavior if no timer state exists.
        const start = timerLastStartedAt?.toMillis() ?? (startedAt?.toMillis() || 0)

        // If not running and no start time, just show static elapsed
        if (!isRunning && !timerLastStartedAt && !startedAt) {
            setDisplayTime(elapsed)
            return
        }

        // If strictly paused (isRunning is false) and we are using the new system
        if (isRunning === false) {
            setDisplayTime(elapsed)
            return
        }

        const update = () => {
            const now = Date.now()
            // If using new system: base + (now - start)
            // If using legacy system: now - start
            const currentSession = start ? Math.max(0, now - start) : 0
            setDisplayTime(elapsed + currentSession)
        }

        update()
        const timer = setInterval(update, 1000)
        return () => clearInterval(timer)
    }, [startedAt, elapsed, timerLastStartedAt, isRunning])

    const totalSeconds = Math.floor(displayTime / 1000)
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60

    const timeString = [
        h > 0 ? h.toString().padStart(2, '0') : null,
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ]
        .filter((part) => part !== null)
        .join(':')

    return (
        <span className={`inline-flex items-center gap-1.5 font-mono ${className}`}>
            {isRunning !== false && (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
            )}
            {isRunning === false && (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
            )}
            {timeString}
        </span>
    )
}
