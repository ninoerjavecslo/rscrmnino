import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { PixelConversation, PixelMessage } from '../lib/types'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pixel-chat`

export interface PixelState {
  conversations: PixelConversation[]
  activeConversationId: string | null
  messages: PixelMessage[]
  streamingContent: string | null   // null = not streaming, string = partial content
  loading: boolean
  sending: boolean
  error: string | null

  fetchConversations: () => Promise<void>
  loadConversation: (id: string) => Promise<void>
  sendMessage: (text: string, forceModel?: 'claude' | 'gpt4o') => Promise<void>
  newConversation: () => void
}

export const usePixelStore = create<PixelState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streamingContent: null,
  loading: false,
  sending: false,
  error: null,

  fetchConversations: async () => {
    const { data } = await supabase
      .from('pixel_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(20)
    set({ conversations: data ?? [] })
  },

  loadConversation: async (id) => {
    set({ loading: true, activeConversationId: id })
    const { data } = await supabase
      .from('pixel_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at')
    set({ messages: data ?? [], loading: false })
  },

  newConversation: () => {
    set({ activeConversationId: null, messages: [], streamingContent: null })
  },

  sendMessage: async (text, forceModel) => {
    const { activeConversationId, messages } = get()
    const optimistic: PixelMessage = {
      id: crypto.randomUUID(),
      conversation_id: activeConversationId ?? '',
      role: 'user',
      content: text,
      model: null,
      created_at: new Date().toISOString(),
    }
    set({ messages: [...messages, optimistic], sending: true, error: null, streamingContent: null })

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ message: text, conversation_id: activeConversationId, history, force_model: forceModel }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')

      const fullText: string = json.message
      const model: PixelMessage['model'] = json.model

      // Typewriter: stream content word by word into streamingContent
      const words = fullText.split(/(\s+)/)
      let built = ''
      set({ streamingContent: '' })

      for (const chunk of words) {
        built += chunk
        set({ streamingContent: built })
        // ~30 chars/sec feel — short chunks faster
        await new Promise(r => setTimeout(r, chunk.length < 2 ? 10 : 18))
      }

      // Done streaming — move to real message
      const assistantMsg: PixelMessage = {
        id: crypto.randomUUID(),
        conversation_id: json.conversation_id,
        role: 'assistant',
        content: fullText,
        model,
        created_at: new Date().toISOString(),
      }
      set(s => ({
        messages: [...s.messages, assistantMsg],
        activeConversationId: json.conversation_id,
        streamingContent: null,
        sending: false,
      }))
      get().fetchConversations()
    } catch (err) {
      set(s => ({
        messages: s.messages.filter(m => m.id !== optimistic.id),
        streamingContent: null,
        sending: false,
        error: (err as Error).message,
      }))
    }
  },
}))
