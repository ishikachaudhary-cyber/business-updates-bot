import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question } = await req.json();

    if (!question) {
      return new Response(
        JSON.stringify({ error: 'Question is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Initialize Supabase client ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase environment variables missing');
      return new Response(
        JSON.stringify({ error: 'Server configuration is incomplete.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Fetch relevant updates (keyword search with fallback) ---
    const keywords = question
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(k => k.length > 2);

    let updatesQuery = supabase
      .from('updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);

    if (keywords.length) {
      const keywordFilters = keywords
        .slice(0, 6) // cap to avoid huge OR clause
        .map(k => `title.ilike.%${k}%,description.ilike.%${k}%`)
        .join(',');
      updatesQuery = updatesQuery.or(keywordFilters);
    }

    let { data: updates, error: dbError } = await updatesQuery;

    // Fallback: if no matches, return recent updates
    if (!dbError && (!updates || updates.length === 0)) {
      const fallback = await supabase
        .from('updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);
      updates = fallback.data || [];
      dbError = fallback.error || null;
    }

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to fetch updates');
    }

    // --- Format updates for AI context ---
    const updatesContext = updates && updates.length > 0
      ? updates.map(u => 
          `Date: ${u.date || 'N/A'}\nTime: ${u.time || 'N/A'}\nTitle: ${u.title}\nDescription: ${u.description}\n`
        ).join('\n---\n')
      : 'No updates available.';

    const systemPrompt = `You are a helpful business assistant. 
- Find the most relevant information from the updates below using keyword/semantic matching (be flexible with phrasing). 
- If nothing is clearly relevant, respond: "No update found for that date or topic."

Updates:

${updatesContext}`;

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('Gemini API key missing');
      return new Response(
        JSON.stringify({ error: 'Gemini API key is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Call Gemini API ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nUser question: ${question}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return new Response(
        JSON.stringify({ error: `Failed to get AI response from Gemini. ${errorText || ''}`.trim() }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

    return new Response(JSON.stringify({ answer }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in ask function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
