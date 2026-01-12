// Netlify Function for AI calls
// Uses HuggingFace Inference Providers (new API as of 2025)
// HF_TOKEN is stored as environment variable

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

    // Combined OCR + Parse: Use a Vision Language Model to read the receipt
    if (action === "ocr" || action === "parse") {
      // For OCR action, we use VLM to read the receipt image directly
      if (action === "ocr" && data.image) {
        console.log('Using VLM to read receipt image...');
        
        const prompt = `You are a receipt scanner. Look at this receipt image and extract the information.

Respond with ONLY a JSON object (no other text, no markdown):
{
  "total": <number - the final total amount paid, look for "TOTAL", "EFTPOS", "PAID", or the largest amount>,
  "vendor": "<store/business name>",
  "date": "<YYYY-MM-DD format if visible, otherwise null>",
  "time": "<HH:MM format if visible, otherwise null>",
  "items": [{"name": "<item name>", "price": <number>}],
  "category": "<one of: kai, catering, drinks, petrol, flowers, clothing, printing, misc>",
  "rawText": "<key text you can read from the receipt>"
}

Category guide:
- kai = supermarkets (Countdown, Pak n Save, New World, Fresh Choice, Woolworths)
- catering = restaurants/takeaway (KFC, McDonalds, Subway, cafes, bakeries)
- drinks = liquor stores (Super Liquor, Liquorland, bottle stores)
- petrol = fuel stations (Z, BP, Mobil, Gull, Caltex)
- flowers = florists
- clothing = clothes stores (Kmart, Farmers, The Warehouse)
- printing = print/office (Warehouse Stationery, OfficeMax)
- misc = anything else

Return ONLY the JSON object.`;

        // Try multiple vision models
        const visionModels = [
          "meta-llama/Llama-3.2-11B-Vision-Instruct",
          "Qwen/Qwen2-VL-7B-Instruct", 
          "microsoft/Phi-3.5-vision-instruct"
        ];
        
        let result = null;
        let lastError = null;
        
        for (const model of visionModels) {
          console.log('Trying vision model:', model);
          
          try {
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: model,
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:image/jpeg;base64,${data.image}`
                        }
                      },
                      {
                        type: "text",
                        text: prompt
                      }
                    ]
                  }
                ],
                max_tokens: 1000,
                temperature: 0.1
              })
            });

            console.log('Response status:', response.status);

            if (response.ok) {
              const json = await response.json();
              console.log('VLM response:', JSON.stringify(json).substring(0, 300));
              
              if (json.choices && json.choices[0]?.message?.content) {
                const content = json.choices[0].message.content;
                
                // Try to parse JSON from response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    result = JSON.parse(jsonMatch[0]);
                    console.log('Parsed result:', result);
                    break; // Success!
                  } catch (e) {
                    console.log('JSON parse error:', e.message);
                    lastError = 'Could not parse JSON from response';
                  }
                } else {
                  lastError = 'No JSON found in response';
                }
              }
            } else {
              lastError = await response.text();
              console.log('Model failed:', model, lastError.substring(0, 200));
            }
          } catch (e) {
            lastError = e.message;
            console.log('Exception with model:', model, e.message);
          }
        }
        
        if (result) {
          return new Response(JSON.stringify({ success: true, result: result }), {
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
      
      // For text-only parse requests (fallback)
      if (action === "parse" && data.prompt) {
        console.log('Text-only parse request');
        
        const textModels = [
          "meta-llama/Llama-3.1-8B-Instruct",
          "mistralai/Mistral-7B-Instruct-v0.3"
        ];
        
        let result = null;
        let lastError = null;
        
        for (const model of textModels) {
          try {
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: model,
                messages: [
                  { role: "user", content: data.prompt }
                ],
                max_tokens: 500,
                temperature: 0.1
              })
            });

            if (response.ok) {
              const json = await response.json();
              if (json.choices && json.choices[0]?.message?.content) {
                result = [{ generated_text: json.choices[0].message.content }];
                break;
              }
            } else {
              lastError = await response.text();
            }
          } catch (e) {
            lastError = e.message;
          }
        }
        
        if (result) {
          return new Response(JSON.stringify({ success: true, result: result }), {
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
