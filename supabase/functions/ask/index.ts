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

    // --- Helpers for date & keyword extraction ---
    const normalizedQuestion = question.toLowerCase();

    const toDateString = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const relativeDates: Record<string, string> = {
      today: toDateString(today),
      tomorrow: toDateString(new Date(today.getTime() + 24 * 60 * 60 * 1000)),
      yesterday: toDateString(new Date(today.getTime() - 24 * 60 * 60 * 1000)),
    };

    const parseDates = (q: string) => {
      const dates = new Set<string>();
      // relative words
      Object.entries(relativeDates).forEach(([word, dateStr]) => {
        if (q.includes(word)) dates.add(dateStr);
      });
      // YYYY-MM-DD or YYYY/MM/DD
      const isoMatch = q.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (isoMatch) {
        const [_, y, m, d] = isoMatch;
        dates.add(`${y}-${m}-${d}`);
      }
      // DD-MM-YYYY or DD/MM/YYYY
      const dmyMatch = q.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
      if (dmyMatch) {
        const [_, d, m, y] = dmyMatch;
        dates.add(`${y}-${m}-${d}`);
      }
      return Array.from(dates);
    };

    const keywords = normalizedQuestion
      .split(/[^a-z0-9]+/g)
      .filter(k => k.length > 2);

    const sanitizeTsQuery = (q: string) => q.replace(/[':]/g, ' ').trim();
    const tsQuery = sanitizeTsQuery(question);
    let textSearchSupported = true;

    const dateCandidates = parseDates(normalizedQuestion);

    let updates: any[] = [];
    let dbError: any = null;

    const tryQuery = async (builder: any) => {
      const { data, error } = await builder;
      if (error) throw error;
      return data || [];
    };

    // Primary: date-specific text search
    if (dateCandidates.length) {
      for (const targetDate of dateCandidates) {
        const base = supabase
          .from('updates')
          .select('*')
          .eq('date', targetDate)
          .order('created_at', { ascending: false })
          .limit(50);

        try {
          if (tsQuery && textSearchSupported) {
            const data = await tryQuery(base.textSearch('search', tsQuery, { type: 'plain', config: 'english' }));
            if (data.length > 0) {
              updates = data;
              break;
            }
          } else {
            const data = await tryQuery(base);
            if (data.length > 0) {
              updates = data;
              break;
            }
          }
        } catch (err: any) {
          console.error('Date search error:', err?.message || err);
          textSearchSupported = false; // fallback for subsequent queries
        }
      }
    }

    // If no date or no results, try text search without date
    if ((dateCandidates.length === 0 || updates.length === 0) && !dbError) {
      let updatesQuery = supabase
        .from('updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      try {
        if (tsQuery && textSearchSupported) {
          const data = await tryQuery(updatesQuery.textSearch('search', tsQuery, { type: 'plain', config: 'english' }));
          updates = data || updates;
        }

        // If text search not supported or no results, try keyword ilike
        if ((!updates || updates.length === 0) || !textSearchSupported) {
          if (keywords.length) {
            const keywordFilters = keywords
              .slice(0, 6)
              .map(k => `title.ilike.%${k}%,description.ilike.%${k}%`)
              .join(',');
            const data = await tryQuery(
              supabase
                .from('updates')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)
                .or(keywordFilters)
            );
            updates = data || updates;
          }
        }
      } catch (error) {
        console.error('Keyword search error:', error);
        dbError = error;
      }
    }

    // Fallback: recent updates
    if ((!updates || updates.length === 0) && !dbError) {
      const fallback = await supabase
        .from('updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);
      updates = fallback.data || [];
      dbError = fallback.error || null;
    }

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to fetch updates');
    }

    // --- If nothing, return fallback message early ---
    if (!updates || updates.length === 0) {
      return new Response(
        JSON.stringify({ answer: 'No update found for that date or topic.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Build context for LLM ---
    const updatesContext = updates
      .map(u => {
        const dateStr = u.date ? new Date(u.date).toISOString().slice(0, 10) : 'N/A';
        return `Date: ${dateStr}\nTime: ${u.time || 'N/A'}\nTitle: ${u.title}\nDescription: ${u.description}`;
      })
      .join('\n---\n');

    const systemPrompt = `You are a helpful business assistant.
- Answer ONLY using the updates below.
- Be concise. If no relevant update exists, reply exactly: "No update found for that date or topic."
- If multiple updates are relevant, summarize them in bullet points.

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

    // --- Call Gemini ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nUser question: ${question}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 500 }
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
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No update found for that date or topic.';

    return new Response(JSON.stringify({ answer }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in ask function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
