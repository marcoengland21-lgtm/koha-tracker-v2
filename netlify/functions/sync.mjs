import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const store = getStore("koha-sync");
    const url = new URL(req.url);
    const syncId = url.searchParams.get("id");

    if ((req.method === "PUT" || req.method === "POST") && syncId) {
      const newData = await req.json();
      const id = syncId.toUpperCase();
      
      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }

      const mergeArrays = (arr1 = [], arr2 = []) => {
        const map = new Map();
        [...arr1, ...arr2].forEach((item) => map.set(item.id, item));
        return Array.from(map.values());
      };

      const merged = {
        gifts: mergeArrays(existing.gifts, newData.gifts),
        expenses: mergeArrays(existing.expenses, newData.expenses),
        transfers: mergeArrays(existing.transfers, newData.transfers),
        syncCode: existing.syncCode || newData.syncCode,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      };

      await store.setJSON(id, merged);

      return new Response(JSON.stringify({ success: true, data: merged }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method === "POST" && !syncId) {
      const data = await req.json();
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let newId = '';
      for (let i = 0; i < 5; i++) {
        newId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      await store.setJSON(newId, {
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return new Response(JSON.stringify({ success: true, id: newId }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method === "GET" && syncId) {
      const data = await store.get(syncId.toUpperCase(), { type: "json" });
      
      if (!data) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400,
      headers: corsHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};

export const config = {
  path: "/api/sync",
};
