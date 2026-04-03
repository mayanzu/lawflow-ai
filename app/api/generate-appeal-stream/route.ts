import { NextRequest } from 'next/server'
import http from 'http'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const bodyStr = JSON.stringify(body)

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3457,
      path: '/generate-appeal-stream',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }

    const proxyReq = http.request(options, (proxyRes) => {
      resolve(
        new Response(proxyRes.body, {
          status: proxyRes.statusCode || 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Transfer-Encoding': 'chunked',
            'Access-Control-Allow-Origin': '*',
          },
        })
      )
    })

    proxyReq.on('error', (err) => {
      resolve(
        new Response(
          `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`,
          {
            status: 500,
            headers: { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' },
          }
        )
      )
    })

    proxyReq.write(bodyStr)
    proxyReq.end()
  })
}
