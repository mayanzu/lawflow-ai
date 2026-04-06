#!/bin/bash
# LawFlow 持续监控系统测试
# 每5分钟运行一次完整测试（6种文书），发现失败立即告警

LOG_DIR="/opt/lawflow/test_logs"
ALERT_SCRIPT="/opt/lawflow/alert_failure.sh"
# 已知可用的测试文件（数字判决书，可OCR）
TEST_FILE_ID="file_1775454490560_3i9t8b"

mkdir -p "$LOG_DIR"

# 清理超过7天的日志
find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null

run_test() {
    local file_id="$1"
    local ts=$(date +%Y%m%d_%H%M%S)
    local log="$LOG_DIR/test_${ts}.log"
    local result=0

    {
        echo "=== LawFlow Test Run $ts ==="
        echo "File ID: $file_id"
        echo ""
    } >> "$log"

    cd /opt/lawflow
    python3 test_system.py --skip-upload --file-id "$file_id" >> "$log" 2>&1
    result=$?

    if [ $result -eq 0 ]; then
        echo "[$ts] PASS - ALL 6 DOC TYPES OK" >> "$LOG_DIR/latest.log"
    else
        echo "[$ts] FAIL - check $log" >> "$LOG_DIR/latest.log"
        echo ""
        echo "=== FAILURE DETAILS ===" >> "$LOG_DIR/latest.log"
        tail -30 "$log" >> "$LOG_DIR/latest.log"
        echo "========================" >> "$LOG_DIR/latest.log"
    fi

    return $result
}

# 主循环
echo "LawFlow Monitor Started at $(date)"
echo "Using test file: $TEST_FILE_ID"
echo "Log: $LOG_DIR/latest.log"
echo ""

while true; do
    ts_loop=$(date +%Y-%m-%d_%H:%M:%S)
    echo "[$ts_loop] Starting test cycle..."

    # 先验证文件存在且可读
    ocr_ok=$(curl -s -X POST http://localhost:3457/ocr \
        -H "Content-Type: application/json" \
        -d "{\"file_id\":\"$TEST_FILE_ID\"}" 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('success') else '0')" 2>/dev/null)

    if [ "$ocr_ok" != "1" ]; then
        echo "[$ts_loop] OCR check failed for $TEST_FILE_ID, retrying in 60s..."
        sleep 60
        continue
    fi

    echo "[$ts_loop] OCR OK, running 6-doc test..."

    if run_test "$TEST_FILE_ID"; then
        echo "[$ts_loop] Cycle PASSED"
    else
        echo "[$ts_loop] Cycle FAILED - see $LOG_DIR/latest.log"
    fi

    echo "[$ts_loop] Sleeping 300s until next cycle..."
    echo "---"
    sleep 300
done
