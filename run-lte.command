#!/bin/zsh
cd "$(dirname "$0")"

NODE="/Users/jun.ji/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
PORT="4177"

echo "네이버 예약 도우미 LTE 모드를 시작합니다."
echo

SERVER_PID=""

if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "이미 ${PORT} 포트에서 서버가 실행 중입니다. 기존 서버를 사용합니다."
else
  echo "로컬 서버를 시작합니다..."
  HOST=0.0.0.0 "$NODE" server.mjs &
  SERVER_PID=$!
  sleep 1

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "서버를 시작하지 못했습니다. run.command로 먼저 앱이 열리는지 확인해 주세요."
    exit 1
  fi
fi

cleanup() {
  echo
  if [ -n "$SERVER_PID" ]; then
    echo "예약 도우미 서버를 종료합니다."
    kill "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

echo
echo "LTE 접속용 임시 HTTPS 주소를 만듭니다."
echo "아래에 나오는 https://...lhr.life 주소를 아이폰 Safari에서 여세요."
echo "이 모드는 PIN 없이 바로 열립니다."
echo

ssh -o ServerAliveInterval=60 -o StrictHostKeyChecking=no -R 80:localhost:${PORT} nokey@localhost.run
