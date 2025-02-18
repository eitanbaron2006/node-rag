// export async function generateEmbedding(text) {
//   const apiKey = process.env.GEMINI_API_KEY;
//   const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/embedding:predict';

//   const response = await fetch(`${apiUrl}?key=${apiKey}`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({ text }),
//   });

//   const data = await response.json();
//   return data.embedding || [];
// }
