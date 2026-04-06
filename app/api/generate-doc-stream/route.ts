import { NextRequest } from 'next/server'
import http from 'http'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const bodyStr = JSON.stringify(body)
  const contentLength = Buffer.byteLength(bodyStr)

  const options = {
    hostname: 'localhost',
    port: 3457,
    path: '/generate-doc-stream',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': contentLength,
    },
  }

  try {
    const res = await new Promise<Response>((resolve, reject) => {
      const proxyReq = http.request(options, (proxyRes) => {
        let settled = false
        const webStream = new ReadableStream({
          start(controller) {
            proxyRes.on('data', (chunk: Buffer) => {
              if (!settled) {
                try { controller.enqueue(chunk) } catch { settled = true }
              }
            })
            proxyRes.on('end', () => { settled = true; try { controller.close() } catch {} })
            proxyRes.on('error', (err) => { settled = true; try { controller.error(err) } catch {} })
          },
          cancel() { proxyReq.destroy() },
        })
        resolve(new Response(webStream, {
          status: proxyRes.statusCode || 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
          },
        }))
      })
      proxyReq.on('error', reject)
      proxyReq.write(bodyStr)
      proxyReq.end()
    })
    return res
  } catch (err: any) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`,
      { status: 500, headers: { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' } }
    )
  }
}
