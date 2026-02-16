import { useParams } from 'react-router-dom'

export default function SharedTripPage() {
  const { shareToken } = useParams()

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Shared Trip</h1>
      <p className="mt-2 text-gray-500">Share token: {shareToken}</p>
    </div>
  )
}
