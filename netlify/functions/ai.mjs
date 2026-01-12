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
      
      console.log('OCR image size:', bytes.length, 'bytes');
      
      // Try multiple OCR models in order of preference
      const ocrModels = [
        'microsoft/trocr-large-printed',
        'microsoft/trocr-base-printed', 
        'naver-clova-ix/donut-base-finetuned-cord-v2'
      ];
      
      let ocrData = null;
      let lastError = null;
      
      for (const model of ocrModels) {
        console.log('Trying OCR model:', model);
        
        try {
          const ocrResponse = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HF_TOKEN}`,
              'Content-Type': 'image/jpeg'
            },
            body: bytes
          });

          console.log('OCR response status:', ocrResponse.status);

          if (ocrResponse.ok) {
            ocrData = await ocrResponse.json();
            console.log('OCR success with', model, ':', JSON.stringify(ocrData).substring(0, 200));
            break;
          } else {
            lastError = await ocrResponse.text();
            console.log('OCR failed with', model, ':', lastError);
          }
        } catch (e) {
          lastError = e.message;
          console.log('OCR exception with', model, ':', e.message);
        }
      }
      
      if (ocrData) {
        return new Response(JSON.stringify({ success: true, result: ocrData }), {
          status: 200,
          headers: corsHeaders,
        });
      } else {
        return new Response(JSON.stringify({ error: "OCR failed", details: lastError }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Parse: Use text generation to extract structured data
    if (action === "parse" || action === "validate") {
      // Try multiple text models
      const textModels = [
        'HuggingFaceH4/zephyr-7b-beta',
        'mistralai/Mistral-7B-Instruct-v0.2',
        'google/flan-t5-large',
        'facebook/bart-large-cnn'
      ];
      
      let parseData = null;
      let lastError = null;
      
      for (const model of textModels) {
        console.log('Trying text model:', model);
        
        try {
          const parseResponse = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
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

          if (parseResponse.ok) {
            parseData = await parseResponse.json();
            console.log('Parse success with', model, ':', JSON.stringify(parseData).substring(0, 200));
            break;
          } else {
            lastError = await parseResponse.text();
            console.log('Parse failed with', model, ':', lastError);
          }
        } catch (e) {
          lastError = e.message;
          console.log('Parse exception with', model, ':', e.message);
        }
      }
      
      if (parseData) {
        return new Response(JSON.stringify({ success: true, result: parseData }), {
          status: 200,
          headers: corsHeaders,
        });
      } else {
        return new Response(JSON.stringify({ error: "Parse failed", details: lastError }), {
          status: 500,
          headers: corsHeaders,
        });
      }
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
