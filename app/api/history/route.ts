import { NextRequest, NextResponse } from 'next/server'
import { API_CONFIG } from '@/lib/config'

const BACKEND = API_CONFIG.backendUrl

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'get'
    
    let endpoint = '/get-history'
    let requestBody = {}
    
    switch (action) {
      case 'get':
        endpoint = '/get-history'
        break
      case 'delete':
        endpoint = '/delete-history'
        requestBody = { file_id: body.file_id }
        break
      case 'clear':
        endpoint = '/clear-history'
        break
      case 'save':
        endpoint = '/save-history'
        requestBody = body
        break
      default:
        endpoint = '/get-history'
    }
    
    const res = await fetch(`${BACKEND}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
