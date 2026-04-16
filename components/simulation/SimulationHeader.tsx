import React from 'react'

type Props = {
  heading?: string
  title: string
  code?: string
  description?: string
}

export default function SimulationHeader({ heading = 'Simulation Details', title, code, description }: Props) {
  return (
    <div>
      <h2 className="font-semibold text-gray-900 mb-2">{heading}</h2>
      <div className="space-y-2 text-sm">
        <div>
          <p className="font-medium text-gray-800">{title || 'Untitled Simulation'}</p>
          {code && <p className="text-gray-500 font-mono">{code}</p>}
        </div>
        {description && <p className="text-gray-600 pt-2 whitespace-pre-wrap">{description}</p>}
      </div>
    </div>
  )
}
