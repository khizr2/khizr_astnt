import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PREFIX_LOGIC: Record<string, any> = {
  '?': { type: 'question', category: 'research', autoProcess: true },
  'zz': { type: 'task', category: 'task', autoProcess: true, createTask: true },
  'og': { type: 'preserve', category: 'archive', autoProcess: false },
  '//': { type: 'comment', category: 'note', autoProcess: false },
  '!!': { type: 'urgent', category: 'urgent', autoProcess: true, priority: 1 }
}

function parseEntry(line: string, lineNumber: number) {
  const trimmed = line.trim()
  if (!trimmed) return null

  let prefix: string | null = null
  let content = trimmed
  let prefixConfig: any = null

  for (const [prefixChar, config] of Object.entries(PREFIX_LOGIC)) {
    if (trimmed.startsWith(prefixChar)) {
      prefix = prefixChar
      content = trimmed.substring(prefixChar.length).trim()
      prefixConfig = config
      break
    }
  }

  return {
    lineNumber,
    prefix,
    content,
    type: prefixConfig?.type || 'general',
    category: prefixConfig?.category || 'general',
    shouldAutoProcess: prefixConfig?.autoProcess || false,
    shouldCreateTask: prefixConfig?.createTask || false,
    priority: prefixConfig?.priority || 3
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABAS_URL')!,
      Deno.env.get('SUPABAS_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    if (req.method === 'POST') {
      const { content, autoProcess = true } = await req.json()

      if (!content || typeof content !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Content is required and must be a string' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: session, error: sessionError } = await supabase
        .from('bigpage_sessions')
        .insert({
          user_id: user.id,
          raw_content: content,
          session_status: 'processing'
        })
        .select()
        .single()
      if (sessionError) throw sessionError

      const lines = content.split('\n')
      const parsedEntries: any[] = []
      const createdNotes: any[] = []
      let processedCount = 0

      for (let i = 0; i < lines.length; i++) {
        const parsed = parseEntry(lines[i], i + 1)
        if (!parsed) continue

        parsedEntries.push(parsed)

        const { data: note, error: noteError } = await supabase
          .from('notes')
          .insert({
            user_id: user.id,
            content: parsed.content,
            prefix: parsed.prefix,
            category: parsed.category,
            source_type: 'bigpage',
            auto_categorized: !!parsed.prefix,
            protected: false,
            stale: false
          })
          .select()
          .single()

        if (noteError) {
          console.error('Note creation error:', noteError)
          continue
        }

        createdNotes.push(note)

        if (parsed.shouldCreateTask) {
          await supabase.from('tasks').insert({
            user_id: user.id,
            title: parsed.content,
            priority: parsed.priority,
            source: 'bigpage',
            source_note_id: note.id,
            ai_generated: true
          })
        }

        if (autoProcess && parsed.shouldAutoProcess) {
          await supabase.from('ai_processing_queue').insert({
            user_id: user.id,
            note_id: note.id,
            processing_type: parsed.type,
            priority: parsed.priority,
            ai_provider: 'local'
          })
        }

        processedCount++
      }

      await supabase
        .from('bigpage_sessions')
        .update({
          total_entries: parsedEntries.length,
          processed_entries: processedCount,
          session_status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', session.id)

      return new Response(
        JSON.stringify({
          session_id: session.id,
          total_lines: lines.length,
          parsed_entries: parsedEntries.length,
          processed_entries: processedCount,
          created_notes: createdNotes.length,
          entries: parsedEntries.map(e => ({
            line: e.lineNumber,
            prefix: e.prefix,
            type: e.type,
            category: e.category,
            content: e.content.substring(0, 100) + (e.content.length > 100 ? '...' : '')
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const limit = parseInt(url.searchParams.get('limit') || '20')
      const prefix = url.searchParams.get('prefix')

      let query = supabase
        .from('notes')
        .select('id, content, prefix, category, ai_analysis, created_at, processed_at')
        .eq('user_id', user.id)
        .eq('source_type', 'bigpage')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (prefix) query = query.eq('prefix', prefix)

      const { data: entries, error: entriesError } = await query
      if (entriesError) throw entriesError

      return new Response(
        JSON.stringify({ entries }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  } catch (error: any) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
