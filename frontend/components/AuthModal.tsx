import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onAuthSuccess: () => void
}

const preferenceOptions = [
  "Food",
  "Art",
  "Outdoors",
  "History",
  "Nightlife",
  "Wellness",
  "Shopping",
  "Adventure",
]

const dietaryOptions = ["vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "pescatarian"]

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [step, setStep] = useState<'credentials' | 'preferences'>('credentials')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([])
  const [selectedLikes, setSelectedLikes] = useState<string[]>([])
  const [selectedDislikes, setSelectedDislikes] = useState<string[]>([])
  const [selectedDietary, setSelectedDietary] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newUserId, setNewUserId] = useState<string | null>(null)
  const [newUserSession, setNewUserSession] = useState<any>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)

  if (!isOpen) return null

  const checkUsernameAvailability = async (usernameToCheck: string): Promise<boolean> => {
    if (!usernameToCheck.trim()) return false
    setCheckingUsername(true)
    try {
      const response = await fetch(`http://localhost:8000/user/username/check?username=${encodeURIComponent(usernameToCheck.trim())}`)
      if (response.ok) {
        const data = await response.json()
        console.log('Username check response:', data)
        return data.available === true
      } else {
        // If response is not OK, try to parse error message
        const errorData = await response.json().catch(() => ({}))
        console.error('Username check failed:', response.status, errorData)
        // If it's a server error (500), assume username might be available (don't block registration)
        // If it's a client error (400), assume username is taken
        if (response.status >= 500) {
          console.warn('Backend error during username check, allowing registration to proceed')
          return true // Allow registration to proceed if backend error
        }
        return false
      }
    } catch (err) {
      console.error('Error checking username:', err)
      // Network error - don't block registration, let backend handle it
      console.warn('Network error during username check, allowing registration to proceed')
      return true // Allow registration to proceed if network error
    } finally {
      setCheckingUsername(false)
    }
  }

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (isSignUp) {
        // Validate username is provided
        if (!username.trim()) {
          setError('Username is required')
          setLoading(false)
          return
        }

        // Validate username format (alphanumeric, underscore, hyphen, 3-20 chars)
        const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/
        if (!usernameRegex.test(username.trim())) {
          setError('Username must be 3-20 characters and contain only letters, numbers, underscores, or hyphens')
          setLoading(false)
          return
        }

        // Check if username is available
        const isAvailable = await checkUsernameAvailability(username.trim())
        if (!isAvailable) {
          setError('Username is already taken. Please choose another.')
          setLoading(false)
          return
        }

        // Sign up with name in metadata
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
            },
          },
        })
        if (error) throw error
        
        // If sign up successful, create user_preferences record immediately with username
        if (data.user) {
          setNewUserId(data.user.id)
          // Store session if available (email confirmation might be disabled)
          if (data.session) {
            setNewUserSession(data.session)
          }
          
          // Create user_preferences record for all users with username
          // This ensures usernames can be saved for all users
          try {
            await fetch('http://localhost:8000/user/preferences/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: data.user.id,
                username: username.trim(),
                preferences: [],
                likes: [],
                dislikes: [],
                dietary_restrictions: [],
              }),
            })
            console.log('Created user_preferences record for new user with username')
          } catch (err) {
            console.error('Error creating user_preferences record:', err)
            // Continue anyway - record will be created when preferences are saved
          }
          
          setStep('preferences')
        } else {
          // Email confirmation required
          alert('Check your email for the confirmation link!')
          onClose()
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        
        // Ensure user_preferences record exists for existing users
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          try {
            await fetch('http://localhost:8000/user/preferences/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: session.user.id,
                preferences: [],
                likes: [],
                dislikes: [],
                dietary_restrictions: [],
              }),
            })
            console.log('Ensured user_preferences record exists for user')
          } catch (err) {
            console.error('Error ensuring user_preferences record:', err)
            // Continue anyway
          }
        }
        
        onAuthSuccess()
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async (userId: string, usernameToSave?: string) => {
    try {
      console.log('Attempting to save preferences for user:', userId)
      console.log('Preferences to save:', {
        username: usernameToSave,
        preferences: selectedPreferences,
        likes: selectedLikes,
        dislikes: selectedDislikes,
        dietary_restrictions: selectedDietary,
      })
      
      // Use backend API to save preferences (bypasses RLS)
      const requestBody: any = {
        user_id: userId,
        preferences: selectedPreferences,
        likes: selectedLikes,
        dislikes: selectedDislikes,
        dietary_restrictions: selectedDietary,
      }
      
      // Add username if provided
      if (usernameToSave) {
        requestBody.username = usernameToSave
      }
      
      const response = await fetch('http://localhost:8000/user/preferences/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error saving preferences:', response.status, errorText)
        return false
      }
      
      const data = await response.json()
      console.log('Preferences saved successfully:', data)
      return true
    } catch (err: any) {
      console.error('Error saving preferences:', err)
      return false
    }
  }

  const handleSkipPreferences = async () => {
    console.log('handleSkipPreferences called')
    setLoading(true)
    setError('')
    try {
      // Check session from signup response first, then try getSession
      let session = newUserSession
      console.log('Initial session from signup:', session)
      
      if (!session) {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
        session = currentSession
        console.log('Session from getSession:', session, 'Error:', sessionError)
      }
      
      const userId = session?.user?.id || newUserId
      console.log('User ID:', userId)
      
      if (userId) {
        // Save empty preferences with username to ensure user_preferences record exists
        // This uses the backend API which bypasses RLS
        const saved = await savePreferences(userId, username.trim())
        console.log('Preferences saved:', saved)
        if (!saved && !session?.user) {
          // Can't save yet due to RLS, but that's OK - will save on login
          console.log('Preferences will be saved when user confirms email and signs in')
        }
      }
      
      // Check if user is actually logged in
      if (session?.user) {
        console.log('User is logged in, calling onAuthSuccess')
        // User is logged in, preferences saved
        onAuthSuccess()
        onClose()
      } else {
        console.log('No session, user needs to confirm email')
        // User needs to confirm email - show message and close
        alert('Account created! Please check your email to confirm your account, then sign in.')
        onClose()
        resetForm()
      }
    } catch (err: any) {
      console.error('Error in handleSkipPreferences:', err)
      setError(err.message || 'Failed to complete registration')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteSignUp = async () => {
    console.log('handleCompleteSignUp called')
    setLoading(true)
    setError('')
    try {
      // Check session from signup response first, then try getSession
      let session = newUserSession
      console.log('Initial session from signup:', session)
      
      if (!session) {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
        session = currentSession
        console.log('Session from getSession:', session, 'Error:', sessionError)
      }
      
      const userId = session?.user?.id || newUserId
      console.log('User ID:', userId, 'Selected preferences:', { selectedPreferences, selectedLikes, selectedDislikes, selectedDietary })
      
      if (userId) {
        // Try to save preferences with username (might fail if no session due to RLS)
        const saved = await savePreferences(userId, username.trim())
        console.log('Preferences saved:', saved)
        if (!saved && !session?.user) {
          // Can't save yet due to RLS - store in sessionStorage to save on login
          sessionStorage.setItem('pending_preferences', JSON.stringify({
            username: username.trim(),
            preferences: selectedPreferences,
            likes: selectedLikes,
            dislikes: selectedDislikes,
            dietary: selectedDietary,
          }))
          console.log('Preferences stored temporarily, will be saved when user confirms email and signs in')
        }
      }
      
      // Check if user is actually logged in
      if (session?.user) {
        console.log('User is logged in, calling onAuthSuccess')
        // User is logged in, preferences saved
        onAuthSuccess()
        onClose()
      } else {
        console.log('No session, user needs to confirm email')
        // User needs to confirm email - show message and close
        alert('Account created! Please check your email to confirm your account. After confirming, sign in and your preferences will be saved.')
        onClose()
        resetForm()
      }
    } catch (err: any) {
      console.error('Error in handleCompleteSignUp:', err)
      setError(err.message || 'Failed to save preferences')
    } finally {
      setLoading(false)
    }
  }

  const togglePreference = (pref: string, type: 'preferences' | 'likes' | 'dislikes' | 'dietary') => {
    if (type === 'preferences') {
      setSelectedPreferences((prev) =>
        prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
      )
    } else if (type === 'likes') {
      setSelectedLikes((prev) =>
        prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
      )
    } else if (type === 'dislikes') {
      setSelectedDislikes((prev) =>
        prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
      )
    } else if (type === 'dietary') {
      setSelectedDietary((prev) =>
        prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
      )
    }
  }

  const resetForm = () => {
    setName('')
    setUsername('')
    setEmail('')
    setPassword('')
    setSelectedPreferences([])
    setSelectedLikes([])
    setSelectedDislikes([])
    setSelectedDietary([])
    setStep('credentials')
    setError('')
    setNewUserId(null)
    setNewUserSession(null)
  }

  if (!isOpen) return null

  // Preferences step (only for sign up)
  if (isSignUp && step === 'preferences') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full max-w-2xl rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl my-8">
          <button
            onClick={() => {
              resetForm()
              onClose()
            }}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
          
          <h2 className="mb-4 text-2xl font-bold text-emerald-900">
            Set Your Preferences (Optional)
          </h2>
          <p className="mb-6 text-sm text-emerald-700">
            Help us personalize your travel experience. You can skip this and set preferences later.
          </p>

          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
            {/* Interests */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-emerald-900">
                Interests
              </label>
              <div className="flex flex-wrap gap-2">
                {preferenceOptions.map((pref) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => togglePreference(pref, 'preferences')}
                    className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                      selectedPreferences.includes(pref)
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {pref}
                  </button>
                ))}
              </div>
            </div>

            {/* Dietary Restrictions */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-emerald-900">
                Dietary Restrictions
              </label>
              <div className="flex flex-wrap gap-2">
                {dietaryOptions.map((diet) => (
                  <button
                    key={diet}
                    type="button"
                    onClick={() => togglePreference(diet, 'dietary')}
                    className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                      selectedDietary.includes(diet)
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {diet}
                  </button>
                ))}
              </div>
            </div>

            {/* Likes */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-emerald-900">
                Things You Like
              </label>
              <input
                type="text"
                placeholder="e.g., museums, hiking, beaches (comma separated)"
                className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                onBlur={(e) => {
                  const values = e.target.value.split(',').map(v => v.trim()).filter(v => v)
                  setSelectedLikes(values)
                }}
              />
              <p className="mt-1 text-xs text-emerald-600">Enter things you enjoy, separated by commas</p>
            </div>

            {/* Dislikes */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-emerald-900">
                Things You Dislike
              </label>
              <input
                type="text"
                placeholder="e.g., crowds, nightlife, tourist traps (comma separated)"
                className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                onBlur={(e) => {
                  const values = e.target.value.split(',').map(v => v.trim()).filter(v => v)
                  setSelectedDislikes(values)
                }}
              />
              <p className="mt-1 text-xs text-emerald-600">Enter things you prefer to avoid, separated by commas</p>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleSkipPreferences}
              disabled={loading}
              className="flex-1 rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
            >
              Skip for Now
            </button>
            <button
              type="button"
              onClick={handleCompleteSignUp}
              disabled={loading}
              className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Credentials step (sign in or sign up step 1)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
        <button
          onClick={() => {
            resetForm()
            onClose()
          }}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
        
        <h2 className="mb-4 text-2xl font-bold text-emerald-900">
          {isSignUp ? 'Sign Up' : 'Sign In'}
        </h2>

        <form onSubmit={handleCredentials} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-emerald-900">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isSignUp}
                  className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-emerald-900">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    setError('') // Clear error when user types
                  }}
                  onBlur={async () => {
                    if (username.trim() && username.trim().length >= 3) {
                      const isAvailable = await checkUsernameAvailability(username.trim())
                      if (!isAvailable) {
                        setError('Username is already taken')
                      }
                    }
                  }}
                  required={isSignUp}
                  pattern="[a-zA-Z0-9_-]{3,20}"
                  className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  placeholder="username (3-20 chars, letters, numbers, _, -)"
                  disabled={checkingUsername}
                />
                {checkingUsername && (
                  <p className="mt-1 text-xs text-emerald-600">Checking availability...</p>
                )}
                {username.trim() && !checkingUsername && (
                  <p className="mt-1 text-xs text-emerald-600">
                    Press Tab or click outside to check availability
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-emerald-900">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-emerald-900">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
          >
            {loading ? 'Processing...' : isSignUp ? 'Continue' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm()
              setIsSignUp(!isSignUp)
            }}
            className="w-full text-sm text-emerald-600 hover:text-emerald-800"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </form>
      </div>
    </div>
  )
}

