import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DevLoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const email = import.meta.env.VITE_DEV_LOGIN_EMAIL as string | undefined
    const password = import.meta.env.VITE_DEV_LOGIN_PASSWORD as string | undefined

    if (!email || !password) {
      setError('Missing VITE_DEV_LOGIN_EMAIL or VITE_DEV_LOGIN_PASSWORD in .env.local')
      return
    }

    supabase.auth.signInWithPassword({ email, password }).then(({ error: err }) => {
      if (err) {
        setError(`Login failed: ${err.message}`)
      } else {
        navigate('/inbox', { replace: true })
      }
    })
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full">
          <h1 className="text-red-800 font-semibold text-lg mb-2">Dev Login Error</h1>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Signing in...</p>
    </div>
  )
}
