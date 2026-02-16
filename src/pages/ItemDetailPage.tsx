import { useParams } from 'react-router-dom'

export default function ItemDetailPage() {
  const { id } = useParams()

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Item Detail</h1>
      <p className="mt-2 text-gray-500">Item: {id}</p>
    </div>
  )
}
