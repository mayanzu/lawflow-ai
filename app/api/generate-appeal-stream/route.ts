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
    path: '/generate-appeal-stream',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': contentLength,
    },
  }

  try {
    const stream = await new Promise<Response>((resolve, reject) => {
      const proxyReq = http.request(options, (proxyRes) => {
        // 将 Node.js IncomingMessage 转换为 Web ReadableStream
        const reader = proxyRes[Symbol.asyncIterator]
          ? proxyRes[Symbol.asyncIterator]()
          : null

        let cancelled = false
        const stream = new ReadableStream({
          async pull(controller) {
            if (cancelled || !reader) {
              controller.close()
              return
            }
            try {
              const { value, done } = await reader.next()
              if (done) {
                controller.close()
              } else {
                controller.enqueue(value)
              }
            } catch (err) {
              controller.error(err)
            }
          },
          cancel() {
            cancelled = true
            proxyReq.destroy()
          },
        })

        resolve(
          new Response(stream, {
            status: proxyRes.statusCode || 200,
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
              'X-Accel-Buffering': 'no',
              'Access-Control-Allow-Origin': '*',
            },
          })
        )
      })

      proxyReq.on('error', (err) => {
        reject(err)
      })

      proxyReq.write(bodyStr)
      proxyReq.end()
    })

    return stream
  } catch (err: any) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' },
      }
    )
  }
}
