import type { MouseEventHandler, ReactNode } from "react"

interface SectionHeaderProps {
  title: string
  subtitle?: string
  emoji?: string
  action?: ReactNode
}

export function SectionHeader({ title, subtitle, emoji, action }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-start gap-3">
        {emoji && (
          <span
            className="text-3xl leading-none select-none"
            role="img"
            aria-hidden
            style={{ marginTop: 2 }}
          >
            {emoji}
          </span>
        )}
        <div>
          <p
            className="text-xl font-semibold tracking-tight leading-snug"
            style={{ color: "var(--foreground)", fontFamily: "-apple-system, 'Helvetica Neue', sans-serif" }}
          >
            {title}
          </p>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

interface IconButtonProps {
  children: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  label: string
  active?: boolean
  destructive?: boolean
}

export function AppIconButton({ children, onClick, label, active = false, destructive = false }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="ios-icon-button touch-target transition-transform active:scale-95"
      style={
        destructive
          ? { color: "var(--destructive)" }
          : active
            ? { background: "var(--accent)", color: "var(--primary)", borderColor: "color-mix(in srgb, var(--primary) 40%, transparent)" }
            : undefined
      }
    >
      {children}
    </button>
  )
}

interface EmptyStateProps {
  icon?: ReactNode
  emoji?: string
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, emoji, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="mb-4">
        {emoji ? (
          <span className="text-5xl" role="img" aria-hidden>{emoji}</span>
        ) : icon ? (
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: "var(--surface-secondary)" }}
          >
            {icon}
          </div>
        ) : null}
      </div>
      <p className="font-semibold text-base mb-1" style={{ color: "var(--foreground)" }}>{title}</p>
      <p className="text-sm mb-5" style={{ color: "var(--text-tertiary)" }}>{description}</p>
      {action}
    </div>
  )
}
