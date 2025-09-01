import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function processWithLocalAI(prompt: string): Promise<string | null> {
  try {
    const response = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: "You are Khizr's personal AI assistant. Respond with valid JSON only. Be concise and actionable." },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch (error) {
    console.error('Local AI error:', error)
    return `{"analysis": "Local AI unavailable", "next_action": "Review manually"}`
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

    const { data: queueItems, error: queueError } = await supabase
      .from('ai_processing_queue')
      .select(`
        id,
        note_id,
        processing_type,
        notes (id, content, prefix, category)
      `)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('priority')
      .limit(5)
    if (queueError) throw queueError

    const results: any[] = []

    for (const queueItem of queueItems) {
      const note = (queueItem as any).notes

      let analysisPrompt = ''
      switch (note.prefix) {
        case '?':
          analysisPrompt = `Research Question: "${note.content}"

Provide JSON response with these exact fields:
{"research_points": ["point1", "point2"], "sources": ["source1"], "timeline": "2 days", "next_action": "specific action"}`
          break
        case 'zz':
          analysisPrompt = `Task: "${note.content}"

Provide JSON response with these exact fields:
{"subtasks": ["step1", "step2"], "estimated_time": "30 minutes", "priority": 3, "dependencies": []}`
          break
        default:
          analysisPrompt = `Analyze: "${note.content}"

Provide JSON response with these exact fields:
{"category": "${note.category}", "action_items": ["action1"], "priority": 3, "next_steps": ["step1"]}`
      }

      const aiResult = await processWithLocalAI(analysisPrompt)

      let analysis: any
      try {
        analysis = aiResult ? JSON.parse(aiResult) : { error: 'AI processing failed' }
      } catch {
        analysis = {
          raw_response: aiResult?.substring(0, 200),
          error: 'Failed to parse JSON',
          fallback_analysis: `Analyzed: ${note.content.substring(0, 100)}...`
        }
      }

      await supabase
        .from('notes')
        .update({ ai_analysis: analysis, processed_at: new Date().toISOString() })
        .eq('id', note.id)

      await supabase
        .from('ai_processing_queue')
        .update({ status: 'completed', result_data: analysis, processed_at: new Date().toISOString() })
        .eq('id', queueItem.id)

      results.push({ note_id: note.id, content: note.content, prefix: note.prefix, analysis })
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('Analysis error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
