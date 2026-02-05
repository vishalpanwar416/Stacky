import { useNavigate } from 'react-router-dom'

export interface Crumb {
  label: string
  path?: string
}

interface BreadcrumbsProps {
  items: Crumb[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const navigate = useNavigate()
  return (
    <nav className="flex items-center gap-2 text-sm theme-text-muted" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="theme-text-faint">/</span>}
          {item.path ? (
            <button
              type="button"
              onClick={() => navigate(item.path!)}
              className="transition-colors hover:theme-text"
            >
              {item.label}
            </button>
          ) : (
            <span className="theme-text-muted">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
