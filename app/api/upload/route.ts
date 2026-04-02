import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file' }, { status: 400 })
    }

    // Validate
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'File too large' }, { status: 400 })
    }

    // Save file
    const uploadDir = join(process.cwd(), 'uploads')
    await mkdir(uploadDir, { recursive: true })

    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const ext = file.name.split('.').pop() || 'bin'
    const fileName = `${fileId}.${ext}`
    const filePath = join(uploadDir, fileName)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Return file ID for OCR processing
    // Also include a small base64 preview for immediate display
    const preview = buffer.toString('base64').slice(0, 1000)

    return NextResponse.json({
      success: true,
      file_id: fileId,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      file_data: `data:${file.type};base64,${preview}`, // small preview only
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
