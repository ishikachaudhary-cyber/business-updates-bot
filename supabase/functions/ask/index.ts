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

    const dateCandidates = parseDates(normalizedQuestion);

    let updates: any[] = [];
    let dbError: any = null;

    // Primary: date-specific text search
    if (dateCandidates.length) {
      for (const targetDate of dateCandidates) {
        let query = supabase
          .from('updates')
          .select('*')
          .eq('date', targetDate)
          .order('created_at', { ascending: false })
          .limit(50);

        if (tsQuery) {
          query = query.textSearch('search', tsQuery, { type: 'plain', config: 'english' });
        }

        const { data, error } = await query;
        if (error) {
          dbError = error;
          break;
        }
        if (data && data.length > 0) {
          updates = data;
          break;
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

      if (tsQuery) {
        updatesQuery = updatesQuery.textSearch('search', tsQuery, { type: 'plain', config: 'english' });
      } else if (keywords.length) {
        const keywordFilters = keywords
          .slice(0, 6)
          .map(k => `title.ilike.%${k}%,description.ilike.%${k}%`)
          .join(',');
        updatesQuery = updatesQuery.or(keywordFilters);
      }

      const { data, error } = await updatesQuery;
      updates = data || updates;
      dbError = error;
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

    // --- Build a simple answer without LLM ---
    if (!updates || updates.length === 0) {
      return new Response(
        JSON.stringify({ answer: 'No update found for that date or topic.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const top = updates.slice(0, 15).map((u, idx) => {
      const dateStr = u.date ? new Date(u.date).toISOString().slice(0, 10) : 'N/A';
      return `${idx + 1}. ${u.title} (${dateStr} ${u.time || ''})\n${u.description}`;
    }).join('\n\n');

    const answer = top || 'No update found for that date or topic.';

    return new Response(JSON.stringify({ answer }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in ask function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
