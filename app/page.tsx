'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Post {
  id: string
  user_id: string
  body: string
  created_at: string
  profiles: {
    name: string
  }
}

interface Profile {
  id: string
  name: string
}

export default function FacebookWall() {
  const [posts, setPosts] = useState<Post[]>([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Check for current profile on load
  useEffect(() => {
    const profileData = localStorage.getItem('currentProfile')
    if (!profileData) {
      router.push('/login')
      return
    }
    
    try {
      const profile = JSON.parse(profileData)
      setCurrentProfile(profile)
    } catch (error) {
      console.error('Error parsing profile data:', error)
      localStorage.removeItem('currentProfile')
      router.push('/login')
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('currentProfile')
    router.push('/login')
  }

  // Function to generate avatar color based on name
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 
      'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500'
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  // Function to get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Function to format timestamp
  const formatTimestamp = (timestamp: string) => {
    const now = new Date()
    const postTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now.getTime() - postTime.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'now'
    if (diffInMinutes < 60) return `${diffInMinutes}m`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`
    return `${Math.floor(diffInMinutes / 1440)}d`
  }

  // Post new message
  const handlePost = async () => {
    if (!message.trim() || isPosting || !currentProfile) return

    setIsPosting(true)
    try {
      const { error } = await supabase
        .from('posts')
        .insert([
          {
            user_id: currentProfile.id,
            body: message.trim(),
            created_at: new Date().toISOString()
          }
        ])

      if (error) {
        console.error('Error posting message:', error)
        return
      }

      setMessage('')
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsPosting(false)
    }
  }

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handlePost()
    }
  }

  useEffect(() => {
    // Fetch initial posts
    const fetchPosts = async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(`
            *,
            profiles (
              name
            )
          `)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) {
          console.error('Error fetching posts:', error)
          return
        }

        setPosts(data || [])
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()

    // Subscribe to realtime changes
    const channel = supabase
      .channel('posts_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts'
        },
        async (payload) => {
          // When a new post is inserted, fetch the complete post with profile data
          const { data: newPostData, error } = await supabase
            .from('posts')
            .select(`
              *,
              profiles (
                name
              )
            `)
            .eq('id', payload.new.id)
            .single()

          if (!error && newPostData) {
            setPosts(current => [newPostData, ...current.slice(0, 49)]) // Keep only latest 50
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Don't render anything if no profile (will redirect to login)
  if (!currentProfile) {
    return <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </div>
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Blue Header */}
      <div className="bg-[#3b5998] text-white px-4 py-2 flex justify-between items-center">
        <h1 className="text-sm font-normal">Wall</h1>
        <button 
          onClick={handleLogout}
          className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
        >
          Logout
        </button>
      </div>

      <div className="flex">
        {/* Left Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 p-4">
          {/* Profile Photo - Avatar */}
          <div className="mb-4">
            <div className={`w-32 h-40 ${getAvatarColor(currentProfile.name)} rounded border mb-2 flex items-center justify-center`}>
              <span className="text-white text-4xl font-bold">{getInitials(currentProfile.name)}</span>
            </div>
          </div>

          {/* Profile Info */}
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-black">{currentProfile.name}</h2>
            <p className="text-sm text-gray-600">Wall</p>
          </div>

          {/* Navigation Links */}
          <div className="mt-6 space-y-2">
            <div className="text-sm text-[#3b5998] cursor-pointer hover:underline">Information</div>
            <div className="text-sm text-gray-600">Networks</div>
            <div className="text-sm text-gray-600">Stanford Alum</div>
            <div className="text-sm text-gray-600">Current City</div>
            <div className="text-sm text-gray-600">Palo Alto, CA</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-white">
          {/* Status Update Box */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 ${getAvatarColor(currentProfile.name)} rounded flex items-center justify-center`}>
                <span className="text-white text-sm font-bold">{getInitials(currentProfile.name)}</span>
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="What's on your mind?"
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  maxLength={280}
                  disabled={isPosting}
                />
                <div className="text-xs text-gray-500 mt-1">{280 - message.length} characters remaining</div>
              </div>
              <button 
                onClick={handlePost}
                disabled={!message.trim() || isPosting}
                className="bg-gray-200 text-gray-700 px-4 py-1 rounded text-sm hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPosting ? 'Posting...' : 'Share'}
              </button>
            </div>
          </div>

          {/* Wall Posts */}
          <div className="divide-y divide-gray-200">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading posts...</div>
            ) : posts.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No posts yet. Be the first to share something!</div>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="p-4 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[#3b5998] text-sm cursor-pointer hover:underline">
                        {post.profiles?.name || 'Unknown User'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(post.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{post.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
