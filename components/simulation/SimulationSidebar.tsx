import React from 'react'

type Props = {
  conversationStarters: string[]
  onSelectStarter?: (starter: string) => void
}

export default function SimulationSidebar({ conversationStarters, onSelectStarter }: Props) {
  if (conversationStarters.length === 0) return null

  return (
    <div className="pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Suggested Starters</p>
      <div className="flex flex-wrap gap-2">
        {conversationStarters.map((starter, idx) => (
          <button
            key={`starter-${idx}`}
            type="button"
            onClick={() => onSelectStarter?.(starter)}
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100 text-left"
            title={starter}
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  )
}
