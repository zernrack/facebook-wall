'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Check if profile already exists
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('name', name.trim())
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error checking profile:', fetchError)
        setError('An error occurred. Please try again.')
        return
      }

      let profileId = existingProfile?.id

      // If profile doesn't exist, create it
      if (!existingProfile) {
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert([
            {
              name: name.trim(),
              created_at: new Date().toISOString()
            }
          ])
          .select()
          .single()

        if (insertError) {
          console.error('Error creating profile:', insertError)
          setError('Failed to create profile. Please try again.')
          return
        }

        profileId = newProfile.id
      }

      // Store profile in localStorage for simple session management
      localStorage.setItem('currentProfile', JSON.stringify({
        id: profileId,
        name: name.trim()
      }))

      // Redirect to main page
      router.push('/')
    } catch (error) {
      console.error('Login error:', error)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#3b5998] mb-2">The Wall</h1>
          <p className="text-gray-600">Enter your name to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3b5998] focus:border-transparent"
              placeholder="Enter your full name"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="w-full bg-[#3b5998] text-white py-3 rounded-lg font-medium hover:bg-[#365899] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Signing in...' : 'Continue'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          This is a demo application. Your data is stored securely in Supabase.
        </div>
      </div>
    </div>
  )
}
