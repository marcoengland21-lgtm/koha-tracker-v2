// Netlify Function for AI calls
// HF_TOKEN is stored as environment variable, never in code

export default async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { action, data } = await req.json();
    const HF_TOKEN = process.env.HF_TOKEN;
    
    if (!HF_TOKEN) {
      return new Response(JSON.stringify({ error: "HF_TOKEN not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // OCR: Extract text from receipt image
    if (action === "ocr") {
      // Convert base64 to binary
      const binaryString = atob(data.image);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Log size for debugging
      console.log('OCR image size:', bytes.length, 'bytes');
      
      // Try the DONUT model for receipt OCR
      const ocrResponse = await fetch('https://router.huggingface.co/hf-inference/models/naver-clova-ix/donut-base-finetuned-cord-v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'image/jpeg'
        },
        body: bytes
      });

      console.log('OCR response status:', ocrResponse.status);

      if (!ocrResponse.ok) {
        const errText = await ocrResponse.text();
        console.log('OCR error:', errText);
        return new Response(JSON.stringify({ error: "OCR failed", details: errText }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      const ocrData = await ocrResponse.json();
      console.log('OCR success:', JSON.stringify(ocrData).substring(0, 200));
      return new Response(JSON.stringify({ success: true, result: ocrData }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Parse or Validate: Use a text generation model
    if (action === "parse" || action === "validate") {
      // Try Mistral with correct URL format
      const parseResponse = await fetch('https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: data.prompt,
          parameters: { 
            max_new_tokens: data.maxTokens || 500, 
            temperature: 0.1,
            return_full_text: false
          }
        })
      });

      console.log('Parse response status:', parseResponse.status);

      if (!parseResponse.ok) {
        const errText = await parseResponse.text();
        console.log('Parse error:', errText);
        
        // If Mistral fails, try a fallback model
        console.log('Trying fallback model...');
        const fallbackResponse = await fetch('https://router.huggingface.co/hf-inference/models/google/flan-t5-large', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: data.prompt,
            parameters: { max_new_tokens: data.maxTokens || 500 }
          })
        });
        
        if (!fallbackResponse.ok) {
          const fallbackErr = await fallbackResponse.text();
          return new Response(JSON.stringify({ error: "Parse failed", details: errText, fallbackError: fallbackErr }), {
            status: 500,
            headers: corsHeaders,
          });
        }
        
        const fallbackData = await fallbackResponse.json();
        return new Response(JSON.stringify({ success: true, result: fallbackData }), {
          status: 200,
          headers: corsHeaders,
        });
      }

      const parseData = await parseResponse.json();
      console.log('Parse success:', JSON.stringify(parseData).substring(0, 200));
      return new Response(JSON.stringify({ success: true, result: parseData }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: corsHeaders,
    });

  } catch (error) {
    console.error("AI error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};

export const config = {
  path: "/api/ai",
};
