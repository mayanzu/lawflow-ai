import { NextRequest, NextResponse } from 'next/server'

const BACKEND = 'http://localhost:3457'

// 创建异步任务
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, file_id, file_name, ...payload } = body

    if (!type || !file_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 转发到后端创建任务
    const resp = await fetch(`${BACKEND}/tasks/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, file_id, file_name, payload }),
    })

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}

// 查询任务状态
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Missing taskId' },
        { status: 400 }
      )
    }

    const resp = await fetch(`${BACKEND}/tasks/status?taskId=${taskId}`)
    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}

// 取消任务
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Missing taskId' },
        { status: 400 }
      )
    }

    const resp = await fetch(`${BACKEND}/tasks/cancel?taskId=${taskId}`, {
      method: 'POST',
    })

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
