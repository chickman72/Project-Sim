import React from 'react'

type BrandWordmarkProps = {
  className?: string
  variant?: 'default' | 'light'
}

export default function BrandWordmark({ className = '', variant = 'default' }: BrandWordmarkProps) {
  const cognitiveClass = variant === 'light' ? 'font-bold text-white' : 'font-bold text-slate-900'
  const clinicalsClass = variant === 'light' ? 'font-light text-brand-100' : 'font-light text-brand-600'

  return (
    <div className={`inline-flex items-baseline gap-2 ${className}`.trim()}>
      <span className={cognitiveClass}>Cognitive</span>
      <span className={clinicalsClass}>Clinicals</span>
    </div>
  )
}
