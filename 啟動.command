#!/bin/bash
cd "$(dirname "$0")"

export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
elif [ -s "$HOME/.fnm/fnm" ]; then
  eval "$("$HOME/.fnm/fnm" env)"
fi
if [ -d "$HOME/.volta/bin" ]; then
  export PATH="$HOME/.volta/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "找不到 Node.js。請先安裝 18.17 或以上版本：https://nodejs.org" buttons {"確定"} default button 1 with icon stop' >/dev/null
  exit 1
fi

echo "正在啟動 Hailuo SplitKit…"
echo "關閉此視窗即停止服務。"
echo
node scripts/launch.js
status=$?
if [ "$status" -ne 0 ]; then
  echo
  read -r -p "啟動失敗，按 Enter 關閉…"
fi
exit "$status"
