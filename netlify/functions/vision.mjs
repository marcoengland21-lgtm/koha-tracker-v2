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
      console.error('GOOGLE_CLOUD_VISION_KEY not found in environment');
      return Response.json({ error: 'Vision API key not configured' }, { status: 500 });
    }
    
    console.log('Vision API: Got image of length', image.length, 'calling Google...');

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

    const responseText = await response.text();
    console.log('Vision API response status:', response.status);
    console.log('Vision API response:', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('Vision API HTTP error:', response.status, responseText);
      return Response.json({ 
        error: 'Vision API HTTP error: ' + response.status, 
        details: responseText 
      }, { status: 500 });
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Vision API response:', e);
      return Response.json({ error: 'Invalid JSON from Vision API', details: responseText }, { status: 500 });
    }
    
    // Check for API-level errors
    if (result.error) {
      console.error('Vision API returned error:', result.error);
      return Response.json({ 
        error: 'Vision API error: ' + (result.error.message || JSON.stringify(result.error)),
        code: result.error.code
      }, { status: 500 });
    }
    
    // Extract the full text from the response
    const textAnnotations = result.responses?.[0]?.textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      console.log('No text found in image');
      return Response.json({ error: 'No text found in image', text: '' }, { status: 200 });
    }

    // First annotation contains the full text
    const fullText = textAnnotations[0].description;
    console.log('Vision API success, text length:', fullText.length);

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
    return Response.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
};
