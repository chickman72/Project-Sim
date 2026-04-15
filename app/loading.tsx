import BrandLoader from '../components/BrandLoader'
import BrandWordmark from '../components/BrandWordmark'

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <BrandWordmark className="text-2xl" />
        <BrandLoader centered className="mt-6" label="Preparing your workspace..." />
      </div>
    </div>
  )
}
