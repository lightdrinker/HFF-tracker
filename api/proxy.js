export default async function handler(req, res) {
  const API_KEY = process.env.VITE_API_KEY
  const { endpoint, startIdx = 1, endIdx = 100, filterField, filterValue } = req.query

  const ALLOWED = ['C003', 'I0030', 'I2710', 'I-0040', 'I-0050']
  if (!ALLOWED.includes(endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint' })
  }

  try {
    let url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${endpoint}/json/${startIdx}/${endIdx}`
    if (filterField && filterValue) {
      url += `/${filterField}=${encodeURIComponent(filterValue)}`
    }
    const response = await fetch(url)
    const data = await response.json()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json(data[endpoint])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
