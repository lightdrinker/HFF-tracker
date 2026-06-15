export default async function handler(req, res) {
  const API_KEY = process.env.HFF_API_KEY || process.env.VITE_API_KEY
  const { endpoint, startIdx = 1, endIdx = 100, filterField, filterValue } = req.query

  if (!API_KEY) {
    return res.status(500).json({ error: 'HFF_API_KEY or VITE_API_KEY is required' })
  }

  const ALLOWED = ['C003', 'I0030', 'I2710', 'I-0040', 'I-0050']
  if (!ALLOWED.includes(endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint' })
  }

  try {
    let url = `https://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${endpoint}/json/${startIdx}/${endIdx}`
    if (filterField && filterValue) {
      url += `/${filterField}=${encodeURIComponent(filterValue)}`
    }
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    })
    const text = await response.text()
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream HTTP ${response.status}` })
    }

    const data = JSON.parse(text)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json(data?.[endpoint] || data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
