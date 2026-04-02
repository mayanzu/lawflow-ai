import { NextRequest, NextResponse } from 'next/server'

const BACKEND = 'http://localhost:3457'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const resp = await fetch(`${BACKEND}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
