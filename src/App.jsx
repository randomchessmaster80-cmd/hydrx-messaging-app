import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import EmojiPicker from 'emoji-picker-react'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef(null)
  const [isSubscribed, setIsSubscribed] = useState(false) 
  
  const pfpInputRef = useRef(null)

  // WhatsApp File Upload Refs
  const imageInputRef = useRef(null)
  const audioInputRef = useRef(null)

  // Notes State
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [songQuery, setSongQuery] = useState('')
  const [songResults, setSongResults] = useState([])
  const [selectedSong, setSelectedSong] = useState(null)
  const [viewingNote, setViewingNote] = useState(null)

  // Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [bioInput, setBioInput] = useState('')

  // Advanced Chat State (WhatsApp + Insta)
  const [replyingTo, setReplyingTo] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [showVoiceCallModal, setShowVoiceCallModal] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState([])
  const [activeMessageMenu, setActiveMessageMenu] = useState(null)
  const [activeReactionMenu, setActiveReactionMenu] = useState(null)
  const [showReactionEmojiPicker, setShowReactionEmojiPicker] = useState(null)
  const [hoveredMessage, setHoveredMessage] = useState(null)

  // DM & Sidebar State
  const [activeChat, setActiveChat] = useState('global')
  const [allUsers, setAllUsers] = useState([])
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdminPanel, setShowAdminPanel] = useState(false)

  const isSubscribedRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkUserProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) checkUserProfile(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Audio Playback Hook for Viewing Notes
  useEffect(() => {
    let audio = null
    if (viewingNote?.note_song_url) {
      audio = new Audio(viewingNote.note_song_url)
      audio.volume = 0.5
      audio.loop = true
      audio.play().catch(e => console.error("Audio blocked:", e))
    }
    return () => {
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }, [viewingNote])

  // Audio Playback Hook for Previewing Songs while Searching
  useEffect(() => {
    let audio = null
    if (selectedSong?.previewUrl && showNoteModal) {
      audio = new Audio(selectedSong.previewUrl)
      audio.volume = 0.5
      audio.loop = true
      audio.play().catch(e => console.error("Audio preview blocked:", e))
    }
    return () => {
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }, [selectedSong, showNoteModal])

  const checkUserProfile = async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) {
      setUser({ id: data.id, name: data.real_name, username: data.username, avatar_url: data.avatar_url, is_admin: data.is_admin, bio: data.bio, hide_status: data.hide_status })
      setNeedsOnboarding(false)
      setIsLoggedIn(true)
      loadInitialData()
      if (!isSubscribedRef.current) {
        isSubscribedRef.current = true
        subscribeToRealtime(data.id, data.hide_status)
      }
    } else {
      setNeedsOnboarding(true)
    }
  }

  const loadInitialData = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: msgData } = await supabase
      .from('messages')
      .select(`*, profiles (real_name, username, avatar_url, is_admin, bio)`)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })
    if (msgData) setMessages(msgData)

    const { data: profData } = await supabase.from('profiles').select('*')
    if (profData) {
      setProfiles(profData)
      setAllUsers(profData)
    }
  }

  const subscribeToRealtime = (userId, hideStatus) => {
    setIsSubscribed(true)
    
    const msgChannel = supabase.channel('public:messages_' + Math.random())
    msgChannel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const { data: profileData } = await supabase.from('profiles').select('real_name, username, avatar_url, is_admin, bio').eq('id', payload.new.sender_id).single()
        const newMessage = { ...payload.new, profiles: profileData }
        setMessages((prev) => {
          if (prev.find(m => m.id === newMessage.id)) return prev
          return [...prev, newMessage]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (payload) => {
        setMessages((prev) => prev.map(msg => msg.id === payload.new.id ? { ...msg, reactions: payload.new.reactions } : msg))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter(msg => msg.id !== payload.old.id))
      })
      .subscribe()

    const profChannel = supabase.channel('public:profiles_' + Math.random())
    profChannel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        setProfiles((prev) => prev.map(p => p.id === payload.new.id ? payload.new : p))
        setAllUsers((prev) => prev.map(p => p.id === payload.new.id ? payload.new : p))
      })
      .subscribe()

    // Presence Tracking
    const presenceRoom = supabase.channel('online_users', {
      config: { presence: { key: userId } }
    })
    
    presenceRoom.on('presence', { event: 'sync' }, () => {
      const state = presenceRoom.presenceState()
      const onlineIds = new Set(Object.keys(state))
      setOnlineUsers(onlineIds)
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && !hideStatus) {
        await presenceRoom.track({ online_at: new Date().toISOString() })
      }
    })
  }

  const handleSendMessage = async (e) => {
    if (e.key === 'Enter' && messageInput.trim() !== '') {
      const text = messageInput
      setMessageInput('')
      setShowEmojiPicker(false)
      const replyId = replyingTo?.id || null
      setReplyingTo(null)
      await supabase.from('messages').insert({ 
        sender_id: user.id, 
        receiver_id: activeChat === 'global' ? null : activeChat,
        content: text, 
        reply_to_id: replyId 
      })
    }
  }

  const handleUnsendMessage = async (msgId) => {
    await supabase.from('messages').delete().eq('id', msgId)
  }

  const toggleReaction = async (msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId);
    let currentReactions = { ...(msg.reactions || {}) };
    let usersForEmoji = currentReactions[emoji] || [];
    
    if (usersForEmoji.includes(user.id)) {
      usersForEmoji = usersForEmoji.filter(id => id !== user.id);
    } else {
      usersForEmoji = [...usersForEmoji, user.id];
    }
    
    if (usersForEmoji.length === 0) {
      delete currentReactions[emoji];
    } else {
      currentReactions[emoji] = usersForEmoji;
    }
    
    setActiveMessageMenu(null)
    await supabase.from('messages').update({ reactions: currentReactions }).eq('id', msgId);
  }

  useEffect(() => {
    if (!showGifPicker) return;
    const fetchGifs = async () => {
      try {
        const url = gifQuery 
          ? `https://api.giphy.com/v1/gifs/search?api_key=zTLC4Zh39LpXBfIp29ga5ZeZqBolQgHg&q=${encodeURIComponent(gifQuery)}&limit=20`
          : `https://api.giphy.com/v1/gifs/trending?api_key=zTLC4Zh39LpXBfIp29ga5ZeZqBolQgHg&limit=20`;
        const res = await fetch(url)
        const data = await res.json()
        setGifResults(data.data)
      } catch (err) { console.error(err) }
    }
    const timeoutId = setTimeout(fetchGifs, 300);
    return () => clearTimeout(timeoutId);
  }, [gifQuery, showGifPicker])

  const handleSendGif = async (gif) => {
    const gifUrl = gif.images.fixed_height.url
    setShowGifPicker(false)
    const replyId = replyingTo?.id || null
    setReplyingTo(null)
    setGifQuery('')
    setGifResults([])
    await supabase.from('messages').insert({ sender_id: user.id, receiver_id: activeChat === 'global' ? null : activeChat, content: "Sent a GIF", media_url: gifUrl, media_type: 'image/gif', reply_to_id: replyId })
  }

  // WhatsApp Style File Upload with Daily Limits
  const handleSpecificFileUpload = async (e, type) => {
    const file = e.target.files[0]
    if (!file) return
    setShowAttachmentMenu(false)

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `${user.id}/${fileName}`

    const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file)
    if (uploadError) { alert("Upload failed: " + uploadError.message); return }

    const { data } = supabase.storage.from('attachments').getPublicUrl(filePath)
    const replyId = replyingTo?.id || null
    setReplyingTo(null)
    await supabase.from('messages').insert({ sender_id: user.id, receiver_id: activeChat === 'global' ? null : activeChat, content: "Sent an attachment", media_url: data.publicUrl, media_type: file.type, reply_to_id: replyId })
    setMessageInput('')
    
    // Reset file inputs
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  const handlePfpUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const fileExt = file.name.split('.').pop()
    const fileName = `pfp_${Date.now()}.${fileExt}`
    const filePath = `avatars/${user.id}/${fileName}`

    const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file)
    if (uploadError) { alert("PFP Upload failed: " + uploadError.message); return }

    const { data } = supabase.storage.from('attachments').getPublicUrl(filePath)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    setUser(prev => ({ ...prev, avatar_url: data.publicUrl }))
  }

  const searchItunes = async (e) => {
    e.preventDefault()
    if (!songQuery) return
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(songQuery)}&entity=song&limit=5`)
      const data = await res.json()
      setSongResults(data.results)
    } catch (err) {
      console.error(err)
    }
  }

  const submitNote = async () => {
    await supabase.from('profiles').update({
      note_text: noteInput || null,
      note_song_title: selectedSong ? `${selectedSong.trackName} - ${selectedSong.artistName}` : null,
      note_song_url: selectedSong ? selectedSong.previewUrl : null
    }).eq('id', user.id)
    setShowNoteModal(false)
    setNoteInput('')
    setSongQuery('')
    setSongResults([])
    setSelectedSong(null)
  }

  const deleteNote = async () => {
    await supabase.from('profiles').update({
      note_text: null,
      note_song_title: null,
      note_song_url: null
    }).eq('id', user.id)
  }

  const saveSettings = async () => {
    await supabase.from('profiles').update({ bio: bioInput }).eq('id', user.id)
    setUser(prev => ({ ...prev, bio: bioInput }))
    setShowSettingsModal(false)
  }

  const toggleHideStatus = async () => {
    const newStatus = !user.hide_status;
    await supabase.from('profiles').update({ hide_status: newStatus }).eq('id', user.id);
    setUser(prev => ({ ...prev, hide_status: newStatus }));
    
    if (newStatus) {
      await supabase.channel('online_users').untrack()
    } else {
      await supabase.channel('online_users').track({ online_at: new Date().toISOString() })
    }
  }

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (error) console.error("Error logging in:", error.message)
  }

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      real_name: formData.get('realname'),
      username: formData.get('username')
    })
    
    if (error) { alert("Database Error: " + error.message); return }
    
    setUser({ id: session.user.id, name: formData.get('realname'), username: formData.get('username') })
    setIsLoggedIn(true)
    setNeedsOnboarding(false)
    loadInitialData()
    if (!isSubscribed) subscribeToRealtime()
  }

  if (!isLoggedIn && !needsOnboarding) {
    return (
      <div className="login-container">
        <div className="login-box" style={{ textAlign: 'center' }}>
          <img src="/favicon.jpg" alt="HYDRX Logo" style={{ width: '80px', height: '80px', borderRadius: '16px', marginBottom: '16px', objectFit: 'cover' }} />
          <h1 className="login-title">Welcome to HYDRX</h1>
          <p className="login-subtitle">We're so excited to see you again!</p>
          <button className="login-btn" onClick={handleGoogleLogin}>Continue with Google</button>
        </div>
      </div>
    )
  }

  if (needsOnboarding) {
    return (
      <div className="login-container">
        <div className="login-box" style={{ textAlign: 'center' }}>
          <img src="/favicon.jpg" alt="HYDRX Logo" style={{ width: '60px', height: '60px', borderRadius: '12px', marginBottom: '12px', objectFit: 'cover' }} />
          <h1 className="login-title">Create your profile</h1>
          <p className="login-subtitle">Let your friends know who you are</p>
          <form className="onboarding-form" onSubmit={handleOnboardingSubmit} style={{ textAlign: 'left' }}>
            <div className="form-group"><label className="form-label">Real Name</label><input name="realname" type="text" className="form-input" required placeholder="John Doe" autoComplete="off" /></div>
            <div className="form-group"><label className="form-label">Username</label><input name="username" type="text" className="form-input" required placeholder="@johndoe" autoComplete="off" /></div>
            <button type="submit" className="submit-btn">Complete Setup</button>
          </form>
        </div>
      </div>
    )
  }

  const currentUserProfile = profiles.find(p => p.id === user?.id)
  const hasNote = currentUserProfile?.note_text || currentUserProfile?.note_song_url

  return (
    <div className="app-container">
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes pulse-call { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      {/* WhatsApp Voice Call Modal */}
      {showVoiceCallModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0b141a', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#00a884', fontSize: '18px', marginBottom: '8px' }}>End-to-end encrypted</div>
          <div style={{ color: 'white', fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Global Chat</div>
          <div style={{ color: '#8696a0', fontSize: '18px', marginBottom: '40px' }}>Calling...</div>
          
          <div style={{ width: '150px', height: '150px', borderRadius: '50%', overflow: 'hidden', marginBottom: '60px', border: '2px solid #00a884', padding: '4px', animation: 'pulse-call 1.5s infinite' }}>
            <img src="/favicon.jpg" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          </div>

          <button onClick={() => setShowVoiceCallModal(false)} style={{ backgroundColor: '#f15c6d', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(241,92,109,0.4)' }}>
            <span style={{ fontSize: '32px', color: 'white', transform: 'rotate(135deg)' }}>📞</span>
          </button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#313338', padding: '24px', borderRadius: '12px', width: '400px' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>User Settings</h2>
            
            <label style={{ color: '#b5bac1', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>About Me (Bio)</label>
            <textarea className="chat-input" placeholder="Write a short bio..." value={bioInput} onChange={e => setBioInput(e.target.value)} maxLength={150} style={{ width: '100%', marginBottom: '16px', boxSizing: 'border-box', minHeight: '80px', resize: 'none', padding: '12px', borderRadius: '8px' }} />
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'transparent', color: '#b5bac1', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveSettings} className="submit-btn" style={{ margin: 0, padding: '8px 24px', width: 'auto' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Dashboard */}
      {showAdminPanel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#2b2d31', padding: '24px', borderRadius: '12px', width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>🛡️ Admin Dashboard</h2>
              <button onClick={() => setShowAdminPanel(false)} style={{ background: 'transparent', color: '#8696a0', border: 'none', cursor: 'pointer', fontSize: '20px' }}>✕</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#1e1f22', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#dbdee1', fontSize: '32px', fontWeight: 'bold' }}>{allUsers.length}</div>
                <div style={{ color: '#8696a0', fontSize: '12px', textTransform: 'uppercase' }}>Total Downloads / Users</div>
              </div>
              <div style={{ backgroundColor: '#1e1f22', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#23a559', fontSize: '32px', fontWeight: 'bold' }}>{Array.from(onlineUsers).filter(id => !allUsers.find(u => u.id === id)?.hide_status).length}</div>
                <div style={{ color: '#8696a0', fontSize: '12px', textTransform: 'uppercase' }}>Currently Online</div>
              </div>
            </div>

            <h3 style={{ color: '#b5bac1', fontSize: '14px', textTransform: 'uppercase', marginBottom: '12px' }}>User Roster</h3>
            <div style={{ overflowY: 'auto', flex: 1, backgroundColor: '#1e1f22', borderRadius: '8px', padding: '8px' }}>
              {allUsers.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #2b2d31' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={u.avatar_url || '/favicon.jpg'} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} alt="pfp" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ color: '#dbdee1', fontWeight: 'bold', fontSize: '14px' }}>{u.real_name}</span>
                      <span style={{ color: '#8696a0', fontSize: '12px' }}>@{u.username}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {u.hide_status && <span style={{ fontSize: '12px', backgroundColor: '#313338', color: '#dbdee1', padding: '2px 6px', borderRadius: '4px' }}>Invisible</span>}
                    {onlineUsers.has(u.id) && !u.hide_status ? (
                      <span style={{ color: '#23a559', fontSize: '12px', fontWeight: 'bold' }}>🟢 Online</span>
                    ) : (
                      <span style={{ color: '#8696a0', fontSize: '12px' }}>⚪ Offline</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Instagram Note Viewer Modal */}
      {viewingNote && (
        <div 
          onClick={() => setViewingNote(null)} 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeIn 0.2s ease-out' }}
          >
            {viewingNote.note_text && (
              <div style={{ backgroundColor: '#2b2d31', padding: '16px 24px', borderRadius: '24px', fontSize: '24px', color: '#dbdee1', marginBottom: '24px', maxWidth: '300px', textAlign: 'center', boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}>
                {viewingNote.note_text}
              </div>
            )}
            
            <div style={{ width: '150px', height: '150px', borderRadius: '50%', border: '4px solid #23a559', overflow: 'hidden', padding: '4px', boxShadow: '0 0 30px rgba(35, 165, 89, 0.4)', animation: viewingNote.note_song_url ? 'spin 4s linear infinite' : 'none' }}>
              <img src={viewingNote.avatar_url || '/favicon.jpg'} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            </div>
            
            <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {viewingNote.real_name}
              {viewingNote.is_admin && (
                <>
                  <span style={{ backgroundColor: '#5865f2', color: 'white', fontSize: '12px', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>🛡️ ADMIN</span>
                  <span style={{ backgroundColor: '#23a559', color: 'white', fontSize: '12px', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>💻 DEV</span>
                </>
              )}
            </div>

            {viewingNote.bio && (
              <div style={{ color: '#dbdee1', fontSize: '14px', marginTop: '12px', maxWidth: '80%', textAlign: 'center', backgroundColor: '#1e1f22', padding: '8px 16px', borderRadius: '12px', border: '1px solid #313338' }}>
                {viewingNote.bio}
              </div>
            )}

            {viewingNote.note_song_title && (
              <div style={{ color: '#23a559', fontSize: '18px', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', animation: 'pulse 2s infinite' }}>
                🎵 {viewingNote.note_song_title}
              </div>
            )}

            {/* Current User Actions inside Viewer */}
            {viewingNote.id === user?.id && (
              <div style={{ marginTop: '40px', display: 'flex', gap: '16px' }}>
                 <button onClick={() => { setViewingNote(null); setShowNoteModal(true); }} style={{ background: '#313338', color: '#dbdee1', border: 'none', cursor: 'pointer', padding: '12px 24px', borderRadius: '24px', fontSize: '15px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>Leave a new note</button>
                 <button onClick={() => { setViewingNote(null); deleteNote(); }} style={{ background: '#da373c', color: 'white', border: 'none', cursor: 'pointer', padding: '12px 24px', borderRadius: '24px', fontSize: '15px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>Delete note</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Note Creation Modal */}
      {showNoteModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#313338', padding: '24px', borderRadius: '12px', width: '400px' }}>
            <h2 style={{ color: 'white', marginTop: 0 }}>Add a Note</h2>
            
            <input type="text" className="chat-input" placeholder="What's on your mind?" value={noteInput} onChange={e => setNoteInput(e.target.value)} maxLength={60} style={{ width: '100%', marginBottom: '16px', boxSizing: 'border-box' }} />
            
            <form onSubmit={searchItunes} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input type="text" className="chat-input" placeholder="Search iTunes for a song..." value={songQuery} onChange={e => setSongQuery(e.target.value)} style={{ flex: 1 }} />
              <button type="submit" className="submit-btn" style={{ padding: '8px 16px', marginTop: 0 }}>Search</button>
            </form>

            <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {songResults.map(song => (
                <div key={song.trackId} onClick={() => setSelectedSong(song)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '8px', cursor: 'pointer', backgroundColor: selectedSong?.trackId === song.trackId ? '#4752c4' : '#2b2d31' }}>
                  <img src={song.artworkUrl60} alt="artwork" style={{ width: '40px', height: '40px', borderRadius: '4px' }} />
                  <div style={{ color: 'white', fontSize: '14px', overflow: 'hidden' }}>
                    <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.trackName}</div>
                    <div style={{ color: '#b5bac1', fontSize: '12px' }}>{song.artistName}</div>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNoteModal(false)} style={{ background: 'transparent', color: '#b5bac1', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitNote} className="submit-btn" style={{ margin: 0, padding: '8px 24px', width: 'auto' }}>Share Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Main App */}
      <div className="servers-sidebar">
        <div className="server-icon active" style={{ backgroundColor: 'transparent' }}>
          <img src="/favicon.jpg" alt="HYDRX" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        </div>
        <div className="server-separator"></div>
        <div className="server-icon" style={{backgroundColor: '#3ba55c', color: 'white'}}>+</div>
      </div>

      <div className="channels-sidebar">
        <div className="sidebar-header"><div className="search-bar-container" style={{width: '100%', padding: '0'}}><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" placeholder="Find or start a conversation" /></div></div>
        
        {/* Instagram-style Notes Row */}
        <div style={{ display: 'flex', overflowX: 'auto', padding: '16px 10px', gap: '16px', borderBottom: '1px solid #1f2023', minHeight: '80px', alignItems: 'flex-start' }}>
          {/* Current User Note / Add Note */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px', position: 'relative' }}>
             {hasNote ? (
               <div 
                 onClick={() => setViewingNote(currentUserProfile)}
                 style={{ cursor: 'pointer', position: 'absolute', top: '-18px', backgroundColor: '#2b2d31', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', color: '#dbdee1', whiteSpace: 'nowrap', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', border: '1px solid #1e1f22', zIndex: 10 }}
               >
                 {currentUserProfile.note_text || "🎵 Listening"}
               </div>
             ) : (
               <div 
                 onClick={() => setShowNoteModal(true)}
                 style={{ cursor: 'pointer', position: 'absolute', top: '-18px', backgroundColor: '#2b2d31', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', color: '#dbdee1', whiteSpace: 'nowrap', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', border: '1px solid #1e1f22', zIndex: 10 }}
               >
                 Add a Note...
               </div>
             )}
             
             <div onClick={() => hasNote ? setViewingNote(currentUserProfile) : setShowNoteModal(true)} style={{ cursor: 'pointer', width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #5865f2', overflow: 'hidden', padding: '2px' }}>
                <img src={user?.avatar_url || '/favicon.jpg'} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
             </div>
             
             {currentUserProfile?.note_song_url && (
               <div style={{ marginTop: '4px', fontSize: '10px', color: '#23a559', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                 🎵 {currentUserProfile.note_song_title}
               </div>
             )}
          </div>
          
          {/* Friends' Notes */}
          {profiles.filter(p => p.id !== user?.id && (p.note_text || p.note_song_url)).map(p => (
            <div key={p.id} onClick={() => setViewingNote(p)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', minWidth: '60px', position: 'relative' }}>
               {p.note_text && (
                 <div style={{ position: 'absolute', top: '-18px', backgroundColor: '#2b2d31', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', color: '#dbdee1', whiteSpace: 'nowrap', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', border: '1px solid #1e1f22', zIndex: 10 }}>
                   {p.note_text}
                 </div>
               )}
               <div style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #23a559', overflow: 'hidden', padding: '2px' }}>
                  <img src={p.avatar_url || '/favicon.jpg'} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
               </div>
               {p.note_song_url && (
                 <div style={{ marginTop: '4px', fontSize: '10px', color: '#23a559', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                   🎵 {p.note_song_title}
                 </div>
               )}
            </div>
          ))}
        </div>

        <div className="dms-list" style={{ flex: 1, overflowY: 'auto' }}>
          <div className={`dm-item ${activeChat === 'global' ? 'active' : ''}`} onClick={() => setActiveChat('global')}>
            <div className="dm-avatar">🌐</div>
            <div className="dm-name">Global Chat</div>
          </div>
          
          {allUsers.filter(u => u.id !== user?.id && (u.real_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.username?.toLowerCase().includes(searchQuery.toLowerCase()))).map(u => (
            <div key={u.id} className={`dm-item ${activeChat === u.id ? 'active' : ''}`} onClick={() => setActiveChat(u.id)} style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <img src={u.avatar_url || '/favicon.jpg'} className="dm-avatar" style={{ objectFit: 'cover' }} alt="pfp" />
                {onlineUsers.has(u.id) && !u.hide_status && (
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: '14px', height: '14px', backgroundColor: '#23a559', borderRadius: '50%', border: '2px solid #2b2d31' }}></div>
                )}
              </div>
              <div className="dm-name" style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{u.real_name}</span>
                <span style={{ fontSize: '12px', color: '#8696a0' }}>@{u.username}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="user-controls">
          <input type="file" ref={pfpInputRef} style={{ display: 'none' }} accept="image/*" onChange={handlePfpUpload} />
          <div className="dm-avatar" style={{width: 32, height: 32, backgroundColor: '#5865f2', cursor: 'pointer', overflow: 'hidden'}} onClick={() => pfpInputRef.current?.click()} title="Change Profile Picture">
            <img src={user?.avatar_url || '/favicon.jpg'} style={{width: '100%', height: '100%', objectFit: 'cover'}} alt="pfp" />
          </div>
          <div className="user-controls-info">
            <div className="user-name" style={{ display: 'flex', alignItems: 'center' }}>
              {user?.username}
              {user?.is_admin && (
                <>
                  <span style={{ marginLeft: '4px', backgroundColor: '#5865f2', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }} title="Admin">🛡️</span>
                  <span style={{ marginLeft: '2px', backgroundColor: '#23a559', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }} title="Developer">💻</span>
                </>
              )}
            </div>
            <div className="user-status" style={{ color: user?.hide_status ? '#8696a0' : '#23a559' }}>{user?.hide_status ? 'Invisible' : 'Online'}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={toggleHideStatus} style={{color: user?.hide_status ? '#8696a0' : '#23a559', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: '18px', opacity: user?.hide_status ? 0.5 : 1}} title={user?.hide_status ? "Go Online" : "Go Invisible"}>👻</button>
            {user?.is_admin && (
              <button onClick={() => setShowAdminPanel(true)} style={{color: '#b5bac1', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: '18px'}} title="Admin Dashboard">📊</button>
            )}
            <button onClick={() => { setBioInput(user?.bio || ''); setShowSettingsModal(true); }} style={{color: '#b5bac1', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: '18px'}} title="User Settings">⚙️</button>
          </div>
        </div>
      </div>

      <div className="chat-area">
        {/* WhatsApp Style Top Header */}
        <div className="chat-header" style={{ padding: '12px 24px', backgroundColor: '#2b2d31', borderBottom: '1px solid #1e1f22', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {activeChat === 'global' ? (
            <div className="chat-header-info" style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#5865f2', marginRight: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🌐</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#dbdee1' }}>Global Chat</span>
                <span style={{ color: '#949ba4', fontSize: '12px' }}>{allUsers.length} members</span>
              </div>
            </div>
          ) : (
            (() => {
              const dmUser = allUsers.find(u => u.id === activeChat)
              return (
                <div className="chat-header-info" style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={dmUser?.avatar_url || '/favicon.jpg'} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '16px' }} alt="pfp" />
                    {onlineUsers.has(dmUser?.id) && !dmUser?.hide_status && <div style={{ position: 'absolute', bottom: 0, right: 16, width: '12px', height: '12px', backgroundColor: '#23a559', borderRadius: '50%', border: '2px solid #2b2d31' }}></div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#dbdee1' }}>{dmUser?.real_name}</span>
                    <span style={{ color: '#949ba4', fontSize: '12px' }}>{onlineUsers.has(dmUser?.id) && !dmUser?.hide_status ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              )
            })()
          )}
          <div className="chat-header-actions" style={{ display: 'flex', gap: '24px' }}>
            <button className="call-btn" onClick={() => setShowVoiceCallModal(true)} title="Voice Call" style={{ fontSize: '20px', color: '#b5bac1', background: 'transparent', border: 'none', cursor: 'pointer' }}>📞</button>
          </div>
        </div>

        <div className="messages-list" style={{ paddingBottom: '20px' }}>
          {messages.filter(msg => {
            if (activeChat === 'global') return msg.receiver_id === null;
            return (msg.sender_id === activeChat && msg.receiver_id === user?.id) || 
                   (msg.sender_id === user?.id && msg.receiver_id === activeChat);
          }).map((msg) => {
            const isHovered = hoveredMessage === msg.id;
            const isMenuOpen = activeMessageMenu === msg.id;
            const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
            
            const isMine = msg.sender_id === user?.id;
            return (
              <div 
                className="message" 
                key={msg.id} 
                style={{ 
                  display: 'flex', 
                  flexDirection: isMine ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  marginBottom: '12px',
                  position: 'relative',
                  width: '100%',
                  gap: '8px'
                }}
                onMouseEnter={() => setHoveredMessage(msg.id)}
                onMouseLeave={() => setHoveredMessage(null)}
              >
                {!isMine && (
                   <img src={msg.profiles?.avatar_url || '/favicon.jpg'} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', marginTop: '4px', alignSelf: 'flex-start' }} alt="pfp" />
                )}
                
                <div style={{ position: 'relative', maxWidth: '70%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    backgroundColor: isMine ? '#0078FF' : '#23a559',
                    borderRadius: isMine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    padding: '8px 12px',
                    color: '#FFFFFF',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {/* Replied Message block inside bubble */}
                    {repliedMsg && (
                      <div onClick={() => {}} style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '6px', borderRadius: '8px', marginBottom: '4px', borderLeft: '4px solid #FFFFFF', cursor: 'pointer' }}>
                        <span style={{ fontWeight: 'bold', color: '#FFFFFF', fontSize: '12px', display: 'block', paddingBottom: '2px' }}>{repliedMsg.profiles?.real_name}</span>
                        <span style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', color: 'rgba(255,255,255,0.9)' }}>{repliedMsg.content}</span>
                      </div>
                    )}

                    {/* Group Chat Name for others */}
                    {!isMine && (
                      <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                        {msg.profiles?.real_name} 
                        {msg.profiles?.is_admin && <span style={{ marginLeft: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>🛡️ ADMIN</span>}
                        {msg.profiles?.is_admin && <span style={{ marginLeft: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>💻 DEV</span>}
                      </span>
                    )}

                    <div className="message-text" style={{ fontSize: '15px', wordWrap: 'break-word', paddingRight: '40px', position: 'relative' }}>
                      {msg.content}
                      {/* Timestamp floats bottom right inside bubble */}
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', position: 'absolute', bottom: '-4px', right: '0' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {msg.media_url && msg.media_type?.startsWith('image/') && <img src={msg.media_url} style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px', display: 'block' }} alt="attachment" />}
                    {msg.media_url && msg.media_type?.startsWith('video/') && <video controls src={msg.media_url} style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px', display: 'block' }} />}
                    {msg.media_url && msg.media_type?.startsWith('audio/') && <audio controls src={msg.media_url} style={{ marginTop: '8px', display: 'block', maxWidth: '240px' }} />}
                  </div>
                  
                  {/* Reactions Display (Below the bubble) */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap', alignSelf: isMine ? 'flex-end' : 'flex-start' }}>
                      {Object.entries(msg.reactions).map(([emoji, users]) => (
                        <div 
                          key={emoji} 
                          onClick={() => { toggleReaction(msg.id, emoji); setActiveReactionMenu(null); }}
                          style={{ 
                            backgroundColor: users.includes(user?.id) ? '#23a559' : '#313338', 
                            border: `1px solid ${users.includes(user?.id) ? '#23a559' : '#3f4147'}`,
                            padding: '2px 8px', 
                            borderRadius: '12px', 
                            fontSize: '13px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }}
                        >
                          <span>{emoji}</span>
                          {users.length > 1 && <span style={{ fontSize: '11px', color: '#FFFFFF', fontWeight: 'bold' }}>{users.length}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Floating Actions Menu (Reactions + 3-Dot) */}
                  {(isHovered || isMenuOpen || activeReactionMenu === msg.id) && (
                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: isMine ? '100%' : 'auto', left: isMine ? 'auto' : '100%', marginLeft: isMine ? '0' : '8px', marginRight: isMine ? '8px' : '0', display: 'flex', gap: '4px', zIndex: 50, backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '12px' }}>
                      
                      {/* Reaction Button */}
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setActiveReactionMenu(activeReactionMenu === msg.id ? null : msg.id)} style={{ background: 'transparent', border: 'none', color: '#8696a0', cursor: 'pointer', padding: '4px', fontSize: '16px', borderRadius: '50%', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'} title="React">😊</button>
                        
                        {activeReactionMenu === msg.id && (
                          <>
                            <div onClick={() => setActiveReactionMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 140 }}></div>
                            <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ffffff', borderRadius: '24px', padding: '6px 12px', display: 'flex', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 150, border: '1px solid #e0e0e0', alignItems: 'center' }}>
                                {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                                  <span key={emoji} onClick={() => { toggleReaction(msg.id, emoji); setActiveReactionMenu(null); }} style={{ fontSize: '24px', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseEnter={e => e.target.style.transform = 'scale(1.2)'} onMouseLeave={e => e.target.style.transform = 'scale(1)'}>
                                    {emoji}
                                  </span>
                                ))}
                                <div style={{ width: '1px', height: '24px', backgroundColor: '#e0e0e0', margin: '0 4px' }}></div>
                                <span onClick={() => { setShowReactionEmojiPicker(msg.id); setActiveReactionMenu(null); }} style={{ fontSize: '18px', cursor: 'pointer', color: '#8696a0', transition: 'transform 0.1s, background-color 0.1s', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#f0f2f5' }} onMouseEnter={e => {e.target.style.transform = 'scale(1.1)'; e.target.style.backgroundColor = '#e0e0e0'}} onMouseLeave={e => {e.target.style.transform = 'scale(1)'; e.target.style.backgroundColor = '#f0f2f5'}} title="More Emojis">
                                  ➕
                                </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Full Emoji Picker Popover */}
                      {showReactionEmojiPicker === msg.id && (
                        <>
                          <div onClick={() => setShowReactionEmojiPicker(null)} style={{ position: 'fixed', inset: 0, zIndex: 140 }}></div>
                          <div style={{ position: 'absolute', bottom: '30px', right: isMine ? '0' : 'auto', left: isMine ? 'auto' : '0', zIndex: 150, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', borderRadius: '8px' }}>
                            <EmojiPicker onEmojiClick={(e) => { toggleReaction(msg.id, e.emoji); setShowReactionEmojiPicker(null); }} theme="dark" />
                          </div>
                        </>
                      )}

                      {/* Options Button */}
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setActiveMessageMenu(isMenuOpen ? null : msg.id)} style={{ background: 'transparent', border: 'none', color: '#8696a0', cursor: 'pointer', padding: '4px', fontSize: '18px', borderRadius: '50%', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'} title="Options">⌄</button>
                        
                        {isMenuOpen && (
                        <>
                          <div onClick={() => setActiveMessageMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 140 }}></div>
                          <div style={{ position: 'absolute', right: isMine ? '0' : 'auto', left: isMine ? 'auto' : '0', top: '24px', backgroundColor: '#2b2d31', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', width: '180px', zIndex: 150, border: '1px solid #1e1f22' }}>
                            <button onClick={() => { setReplyingTo(msg); setActiveMessageMenu(null); }} style={{ background: 'transparent', color: '#dbdee1', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', fontSize: '14px', borderRadius: '4px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#383a40'} onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'}>Reply</button>
                            {isMine && (
                              <button onClick={() => { handleUnsendMessage(msg.id); setActiveMessageMenu(null); }} style={{ background: 'transparent', color: '#da373c', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', fontSize: '14px', borderRadius: '4px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#383a40'} onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'}>Delete for everyone</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* WhatsApp Style Chat Input Area */}
        <div className="chat-input-container" style={{ flexDirection: 'column', padding: '0 16px 24px 16px', position: 'relative' }}>
          
          {/* Reply Banner */}
          {replyingTo && (
            <div style={{ backgroundColor: '#2b2d31', padding: '12px 16px', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#b5bac1', fontSize: '13px', borderBottom: '1px solid #1e1f22' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontWeight: 'bold', color: '#00a884' }}>Replying to {replyingTo.profiles?.real_name}</span>
                <span style={{ color: '#8696a0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>{replyingTo.content}</span>
              </div>
              <button onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', color: '#8696a0', cursor: 'pointer', fontSize: '20px' }}>✕</button>
            </div>
          )}

          {/* WhatsApp Style Attachment Menu */}
          {showAttachmentMenu && (
            <div style={{ position: 'absolute', bottom: replyingTo ? '110px' : '80px', left: '60px', zIndex: 100, backgroundColor: '#2b2d31', borderRadius: '16px', padding: '24px', display: 'flex', gap: '32px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', border: '1px solid #1e1f22' }}>
               <div onClick={() => { imageInputRef.current?.click(); setShowAttachmentMenu(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                 <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundImage: 'linear-gradient(135deg, #0078FF 0%, #00C6FF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 4px 12px rgba(0,198,255,0.4)' }}>🖼️</div>
                 <span style={{ color: '#dbdee1', fontSize: '13px', fontWeight: 'bold' }}>Photos</span>
               </div>
               <div onClick={() => { audioInputRef.current?.click(); setShowAttachmentMenu(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                 <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundImage: 'linear-gradient(135deg, #FF9800 0%, #FF5722 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 4px 12px rgba(255,87,34,0.4)' }}>🎵</div>
                 <span style={{ color: '#dbdee1', fontSize: '13px', fontWeight: 'bold' }}>Audio</span>
               </div>
            </div>
          )}

          {/* Emoji Picker Popup */}
          {showEmojiPicker && (
            <div style={{ position: 'absolute', bottom: replyingTo ? '100px' : '70px', left: '16px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
               <EmojiPicker theme="dark" onEmojiClick={(e) => setMessageInput(prev => prev + e.emoji)} />
            </div>
          )}

          {/* GIF Picker Popup */}
          {showGifPicker && (
            <div style={{ position: 'absolute', bottom: replyingTo ? '100px' : '70px', right: '16px', zIndex: 100, backgroundColor: '#262626', borderRadius: '12px', width: '320px', height: '400px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1px solid #363636' }}>
               <div style={{ padding: '12px', borderBottom: '1px solid #363636' }}>
                 <input type="text" placeholder="Search GIPHY" value={gifQuery} onChange={e => setGifQuery(e.target.value)} style={{ width: '100%', padding: '10px 16px', borderRadius: '20px', border: 'none', backgroundColor: '#363636', color: 'white', boxSizing: 'border-box', outline: 'none', fontSize: '14px' }} autoFocus />
               </div>
               <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', padding: '2px' }}>
                 {gifResults.map(gif => (
                   <img key={gif.id} src={gif.images.fixed_height_small.url} onClick={() => handleSendGif(gif)} style={{ width: '100%', height: '120px', objectFit: 'cover', cursor: 'pointer' }} alt="gif" />
                 ))}
               </div>
            </div>
          )}

          <div className="chat-input-wrapper" style={{ borderRadius: replyingTo ? '0 0 24px 24px' : '24px', padding: '8px 16px', backgroundColor: '#2b2d31', display: 'flex', alignItems: 'center' }}>
            <input type="file" ref={imageInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleSpecificFileUpload(e, 'image')} />
            <input type="file" ref={audioInputRef} style={{ display: 'none' }} accept="audio/*" onChange={(e) => handleSpecificFileUpload(e, 'audio')} />
            
            <button style={{color: '#8696a0', fontSize: '26px', padding: '0 8px', cursor: 'pointer', border: 'none', background: 'transparent'}} onClick={() => {setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); setShowAttachmentMenu(false);}} title="Emojis">😀</button>
            <button style={{color: '#8696a0', fontSize: '26px', padding: '0 8px', cursor: 'pointer', border: 'none', background: 'transparent', transform: 'rotate(45deg)'}} onClick={() => {setShowAttachmentMenu(!showAttachmentMenu); setShowEmojiPicker(false); setShowGifPicker(false);}} title="Attach File">📎</button>
            
            <input type="text" className="chat-input" style={{ backgroundColor: 'transparent', fontSize: '15px', color: '#dbdee1' }} placeholder="Type a message" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={handleSendMessage} />
            
            <button style={{color: '#8696a0', fontSize: '16px', padding: '0 8px', cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 'bold'}} onClick={() => {setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); setShowAttachmentMenu(false);}} title="Send a GIF">GIF</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
