// Google Cloud Vision API for receipt OCR
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { image } = await req.json();
    
    if (!image) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_CLOUD_VISION_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Vision API not configured' }, { status: 500 });
    }

    // Call Google Cloud Vision API
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: image // base64 encoded image (without data:image prefix)
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vision API error:', errorText);
      return Response.json({ error: 'Vision API failed', details: errorText }, { status: 500 });
    }

    const result = await response.json();
    
    // Extract the full text from the response
    const textAnnotations = result.responses?.[0]?.textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      return Response.json({ error: 'No text found in image', text: '' }, { status: 200 });
    }

    // First annotation contains the full text
    const fullText = textAnnotations[0].description;

    return Response.json({ 
      success: true, 
      text: fullText,
      // Also return individual words/blocks if needed
      blocks: textAnnotations.slice(1).map(t => ({
        text: t.description,
        bounds: t.boundingPoly?.vertices
      }))
    });

  } catch (error) {
    console.error('Vision function error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
