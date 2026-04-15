import React from 'react'

type BrandLoaderProps = {
  label?: string
  centered?: boolean
  className?: string
}

export default function BrandLoader({ label = 'Loading...', centered = false, className = '' }: BrandLoaderProps) {
  return (
    <div className={`${centered ? 'flex flex-col items-center justify-center' : 'flex items-center'} ${className}`.trim()}>
      <div className="inline-flex items-center gap-1.5">
        <span className="brand-loader-dot" />
        <span className="brand-loader-dot" />
        <span className="brand-loader-dot" />
      </div>
      {label ? <span className={`${centered ? 'mt-3' : 'ml-3'} text-sm text-slate-600`}>{label}</span> : null}
    </div>
  )
}
